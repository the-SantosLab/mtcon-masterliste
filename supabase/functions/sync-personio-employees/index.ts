// Personio Sync (Phase 2)
// Holt Mitarbeitende aus Personio und synchronisiert sie mit users_profile.
// Credentials werden bevorzugt aus integration_settings (id='personio') gelesen,
// fallback auf Env-Secrets PERSONIO_CLIENT_ID / PERSONIO_CLIENT_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Role = 'admin' | 'staff' | 'viewer';

interface MappedEmployee {
  email: string;
  display_name: string;
  department_name: string | null;
  is_manager: boolean;
  active: boolean;
  short_code: string | null;
  manager_email: string | null;
  external_id: string | null;
}

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function attr<T = unknown>(emp: any, key: string): T | null {
  const a = emp?.attributes?.[key];
  if (!a) return null;
  return (a.value ?? null) as T;
}

async function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Personio /v1/auth fehlgeschlagen [${res.status}]: ${text}`);
  }
  const data = await res.json();
  const token = data?.data?.token;
  if (!token) throw new Error('Personio /v1/auth: kein Token in Antwort');
  return token;
}

async function fetchAllEmployees(baseUrl: string, token: string): Promise<any[]> {
  const res = await fetch(`${baseUrl}/v1/company/employees`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Personio /v1/company/employees fehlgeschlagen [${res.status}]: ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

function mapEmployee(emp: any): MappedEmployee | null {
  const email = String(attr<string>(emp, 'email') || '').trim().toLowerCase();
  if (!email) return null;
  const first = String(attr<string>(emp, 'first_name') || '').trim();
  const last = String(attr<string>(emp, 'last_name') || '').trim();
  const display_name = [first, last].filter(Boolean).join(' ') || email.split('@')[0];

  const deptVal: any = attr(emp, 'department');
  const department_name = deptVal?.attributes?.name ? String(deptVal.attributes.name) : null;

  const supVal: any = attr(emp, 'supervisor');
  const manager_email = supVal?.attributes?.email?.value
    ? String(supVal.attributes.email.value).toLowerCase()
    : null;

  const status = String(attr<string>(emp, 'status') || 'active').toLowerCase();
  const active = status === 'active';

  const position = String(attr<string>(emp, 'position') || '').toLowerCase();
  const is_manager = /lead|head|manager|leiter|leitung/.test(position);

  const id = attr<number | string>(emp, 'id');
  return {
    email,
    display_name,
    department_name,
    is_manager,
    active,
    short_code: null,
    manager_email,
    external_id: id != null ? String(id) : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return j(401, { error: 'Unauthorized' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return j(401, { error: 'Unauthorized' });
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!roleRow) return j(403, { error: 'Forbidden – Admins only' });

  // Credentials aus DB (bevorzugt) bzw. Env (fallback)
  const { data: settingsRow } = await admin
    .from('integration_settings').select('config').eq('id', 'personio').maybeSingle();
  const cfg = (settingsRow?.config as Record<string, string> | undefined) || {};
  const clientId = cfg.client_id || Deno.env.get('PERSONIO_CLIENT_ID');
  const clientSecret = cfg.client_secret || Deno.env.get('PERSONIO_CLIENT_SECRET');
  const baseUrl = cfg.base_url || Deno.env.get('PERSONIO_BASE_URL') || 'https://api.personio.de';

  if (!clientId || !clientSecret) {
    return j(412, {
      error: 'Personio-Credentials fehlen',
      missing: ['client_id', 'client_secret'],
      hint: 'Im Admin-Bereich unter Personio → Zugangsdaten hinterlegen.',
    });
  }

  let body: { dry_run?: boolean; deactivate_missing?: boolean; default_role?: Role; send_invite?: boolean } = {};
  try { body = await req.json(); } catch { /* leerer Body ok */ }
  const dryRun = body.dry_run === true;
  const deactivateMissing = body.deactivate_missing !== false;
  const defaultRole: Role = body.default_role || 'staff';
  const sendInvite = body.send_invite === true;

  try {
    const token = await getAccessToken(baseUrl, clientId, clientSecret);
    const raw = await fetchAllEmployees(baseUrl, token);
    const mapped = raw.map(mapEmployee).filter((x): x is MappedEmployee => !!x);

    if (dryRun) {
      return j(200, { ok: true, dry_run: true, total: mapped.length, sample: mapped.slice(0, 5) });
    }

    const importRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bulk-import-users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: mapped, default_role: defaultRole, send_invite: sendInvite }),
    });
    const importJson = await importRes.json().catch(() => ({}));

    // Geschützte E-Mails, die NIE durch den Personio-Sync deaktiviert werden
    // (Dev-/Service-Accounts ohne Personio-Eintrag).
    const EXEMPT_EMAILS = new Set<string>([
      'js@santoslab.de',
      'nathalie.kress@mtcon.eu',
    ]);

    let deactivated = 0;
    if (deactivateMissing) {
      const personioEmails = new Set(mapped.filter(m => m.active).map(m => m.email));
      const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const all = authList?.users || [];

      // Admin-User aus user_roles ziehen — diese werden ebenfalls nie deaktiviert.
      const { data: adminRoles } = await admin
        .from('user_roles').select('user_id').eq('role', 'admin');
      const adminIds = new Set((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

      const toDeactivate = all
        .filter(u => {
          if (!u.email) return false;
          const email = u.email.toLowerCase();
          if (personioEmails.has(email)) return false;
          if (EXEMPT_EMAILS.has(email)) return false;
          if (adminIds.has(u.id)) return false;
          return true;
        })
        .map(u => u.id);
      if (toDeactivate.length > 0) {
        const { error: deErr } = await admin
          .from('users_profile').update({ active: false }).in('id', toDeactivate);
        if (!deErr) deactivated = toDeactivate.length;
      }
    }

    // Letzten Sync-Zeitstempel zurückschreiben
    await admin.from('integration_settings').upsert({
      id: 'personio',
      config: { ...cfg, last_sync_at: new Date().toISOString(), last_sync_count: mapped.length },
      updated_by: user.id,
    });

    return j(200, { ok: true, synced: mapped.length, deactivated, import: importJson });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync fehlgeschlagen';
    return j(500, { ok: false, error: msg });
  }
});

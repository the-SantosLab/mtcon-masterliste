// Personio Sync (Phase 2)
// Holt Mitarbeitende aus Personio und synchronisiert sie mit users_profile.
// Erwartet Secrets: PERSONIO_CLIENT_ID, PERSONIO_CLIENT_SECRET (optional PERSONIO_BASE_URL).
// Solange Secrets fehlen, antwortet die Function mit einer klaren Meldung — keine weiteren Code-Anpassungen nötig.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PERSONIO_BASE_URL = Deno.env.get('PERSONIO_BASE_URL') || 'https://api.personio.de';

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

// Personio v1 employees API liefert Felder als { label, value, type }
function attr<T = unknown>(emp: any, key: string): T | null {
  const a = emp?.attributes?.[key];
  if (!a) return null;
  // value kann selbst ein Objekt mit attributes sein (z. B. department, supervisor)
  return (a.value ?? null) as T;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${PERSONIO_BASE_URL}/v1/auth`, {
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

async function fetchAllEmployees(token: string): Promise<any[]> {
  // Personio paginiert nicht standardmäßig auf /v1/company/employees → einfacher Single-Call.
  const res = await fetch(`${PERSONIO_BASE_URL}/v1/company/employees`, {
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

  // Heuristik: jemand ist Manager, wenn position ein "Lead/Head/Manager"-Wording enthält.
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

  // AuthZ: nur Admins
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

  const clientId = Deno.env.get('PERSONIO_CLIENT_ID');
  const clientSecret = Deno.env.get('PERSONIO_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return j(412, {
      error: 'Personio-Credentials fehlen',
      missing_secrets: ['PERSONIO_CLIENT_ID', 'PERSONIO_CLIENT_SECRET'],
      hint: 'Secrets in Lovable Cloud hinterlegen, dann erneut ausführen.',
    });
  }

  let body: { dry_run?: boolean; deactivate_missing?: boolean; default_role?: Role; send_invite?: boolean } = {};
  try { body = await req.json(); } catch { /* leerer Body ok */ }
  const dryRun = body.dry_run === true;
  const deactivateMissing = body.deactivate_missing !== false; // default an
  const defaultRole: Role = body.default_role || 'staff';
  const sendInvite = body.send_invite === true;

  try {
    const token = await getAccessToken(clientId, clientSecret);
    const raw = await fetchAllEmployees(token);
    const mapped = raw.map(mapEmployee).filter((x): x is MappedEmployee => !!x);

    if (dryRun) {
      return j(200, {
        ok: true,
        dry_run: true,
        total: mapped.length,
        sample: mapped.slice(0, 5),
      });
    }

    // Re-use bulk-import-users via Service-Role HTTP-Call
    const importRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/bulk-import-users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: mapped, default_role: defaultRole, send_invite: sendInvite }),
    });
    const importJson = await importRes.json().catch(() => ({}));

    let deactivated: string[] = [];
    if (deactivateMissing) {
      const personioEmails = new Set(mapped.filter(m => m.active).map(m => m.email));
      // Alle aktiven Profile mit E-Mail laden — vergleiche nur die, die wir auch tatsächlich kennen.
      const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const all = authList?.users || [];
      const toDeactivate = all
        .filter(u => u.email && !personioEmails.has(u.email.toLowerCase()))
        .map(u => u.id);
      if (toDeactivate.length > 0) {
        // Wir setzen nur active=false auf users_profile — keine Auth-Löschung.
        const { error: deErr } = await admin
          .from('users_profile')
          .update({ active: false })
          .in('id', toDeactivate);
        if (!deErr) deactivated = toDeactivate;
      }
    }

    return j(200, {
      ok: true,
      synced: mapped.length,
      deactivated: deactivated.length,
      import: importJson,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync fehlgeschlagen';
    return j(500, { ok: false, error: msg });
  }
});

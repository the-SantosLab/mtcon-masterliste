// Idempotenter Mitarbeiter-Bulk-Import (Phase 1 — Personio Übergangslösung)
// Verarbeitet Zeilen aus CSV: anlegen, oder bei vorhandener E-Mail aktualisieren.
// Optionaler 2. Pass setzt manager_id anhand manager_email.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Role = 'admin' | 'staff' | 'viewer';

interface InRow {
  email: string;
  display_name: string;
  short_code?: string | null;
  department_name?: string | null;
  role?: Role | null;
  manager_email?: string | null;
  is_manager?: boolean | null;
  active?: boolean | null;
}

interface OutRow {
  email: string;
  status: 'created' | 'updated' | 'error' | 'skipped';
  message?: string;
  user_id?: string;
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user }, error: userErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!roleRow) {
    return new Response(JSON.stringify({ error: 'Forbidden – Admins only' }), { status: 403, headers: corsHeaders });
  }

  let body: { rows?: InRow[]; default_role?: Role; send_invite?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const defaultRole: Role = body.default_role || 'staff';
  const sendInvite = body.send_invite === true;

  if (rows.length === 0) {
    return new Response(JSON.stringify({ error: 'Keine Zeilen' }), { status: 400, headers: corsHeaders });
  }
  if (rows.length > 1000) {
    return new Response(JSON.stringify({ error: 'Max. 1000 Zeilen pro Import' }), { status: 400, headers: corsHeaders });
  }

  // Departments & profiles vorab laden
  const [{ data: depts }, { data: existingProfiles }] = await Promise.all([
    admin.from('departments').select('id, name'),
    admin.from('users_profile').select('id, short_code'),
  ]);
  const deptByName = new Map<string, string>(
    (depts || []).map(d => [String(d.name).toLowerCase().trim(), d.id])
  );
  const usedShortCodes = new Set<string>((existingProfiles || []).map(p => String(p.short_code || '').toUpperCase()));

  // Bestehende Auth-User per E-Mail finden (paginierte Suche)
  const emailToAuthId = new Map<string, string>();
  let page = 1;
  while (page <= 20) { // bis zu 20.000 User
    const { data: list, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) break;
    list.users.forEach(u => { if (u.email) emailToAuthId.set(u.email.toLowerCase(), u.id); });
    if (list.users.length < 1000) break;
    page++;
  }

  const ensureUniqueShort = (base: string): string => {
    let s = (base || 'USR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'USR';
    if (!usedShortCodes.has(s)) { usedShortCodes.add(s); return s; }
    for (let n = 2; n < 999; n++) {
      const candidate = (s + n).slice(0, 8);
      if (!usedShortCodes.has(candidate)) { usedShortCodes.add(candidate); return candidate; }
    }
    return s + Math.random().toString(36).slice(2, 4).toUpperCase();
  };

  const results: OutRow[] = [];
  // Map E-Mail → user_id (für Manager-Pass)
  const emailToUserId = new Map<string, string>(emailToAuthId);

  // Pass 1: Anlegen / Aktualisieren
  for (const r of rows) {
    const email = (r.email || '').trim().toLowerCase();
    if (!isEmail(email)) {
      results.push({ email, status: 'error', message: 'Ungültige E-Mail' });
      continue;
    }
    const display_name = (r.display_name || '').trim() || email.split('@')[0];
    const role: Role = (r.role && ['admin', 'staff', 'viewer'].includes(r.role)) ? r.role : defaultRole;
    const dept_id = r.department_name
      ? (deptByName.get(String(r.department_name).toLowerCase().trim()) || null)
      : null;
    const active = r.active === false ? false : true;
    const is_manager = r.is_manager === true;

    try {
      let authId = emailToAuthId.get(email);
      let created = false;
      if (!authId) {
        const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: { display_name },
        });
        if (createErr || !createdUser.user) throw new Error(createErr?.message || 'createUser fehlgeschlagen');
        authId = createdUser.user.id;
        emailToAuthId.set(email, authId);
        created = true;
      }
      emailToUserId.set(email, authId);

      // short_code: bei Update nur setzen, falls leer
      const { data: existingProfile } = await admin
        .from('users_profile')
        .select('short_code')
        .eq('id', authId)
        .maybeSingle();

      const shortCode = (r.short_code || '').trim().toUpperCase()
        || existingProfile?.short_code
        || ensureUniqueShort(display_name.split(' ').map(p => p[0]).join(''));

      await admin.from('users_profile').upsert({
        id: authId,
        display_name,
        short_code: shortCode,
        department_id: dept_id,
        is_manager,
        active,
      });

      // Rolle aktualisieren: nur falls noch nicht vorhanden in dieser Rolle
      const { data: existingRole } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', authId)
        .eq('role', role)
        .maybeSingle();
      if (!existingRole) {
        await admin.from('user_roles').upsert({ user_id: authId, role }, { onConflict: 'user_id,role' });
      }

      if (created && sendInvite) {
        await admin.auth.admin.generateLink({ type: 'recovery', email }).catch(() => {});
      }

      results.push({ email, status: created ? 'created' : 'updated', user_id: authId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Fehler';
      results.push({ email, status: 'error', message: msg });
    }
  }

  // Pass 2: manager_id setzen
  for (const r of rows) {
    const email = (r.email || '').trim().toLowerCase();
    const managerEmail = (r.manager_email || '').trim().toLowerCase();
    if (!email || !managerEmail) continue;
    const userId = emailToUserId.get(email);
    const managerId = emailToUserId.get(managerEmail);
    if (!userId || !managerId || userId === managerId) continue;
    await admin.from('users_profile').update({ manager_id: managerId }).eq('id', userId);
  }

  const summary = {
    total: results.length,
    created: results.filter(r => r.status === 'created').length,
    updated: results.filter(r => r.status === 'updated').length,
    errors: results.filter(r => r.status === 'error').length,
  };

  return new Response(JSON.stringify({ summary, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

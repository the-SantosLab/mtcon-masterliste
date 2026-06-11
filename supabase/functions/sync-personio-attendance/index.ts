// Personio Attendance & Absence Sync
// Holt täglich/regelmäßig Stempelzeiten und Abwesenheiten aus Personio.
// Wird per pg_cron alle 5 Minuten getriggert ODER manuell von Admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function attr<T = unknown>(emp: any, key: string): T | null {
  const a = emp?.attributes?.[key];
  if (a === undefined || a === null) return null;
  return (a.value ?? a) as T;
}

async function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Personio auth [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const token = data?.data?.token;
  if (!token) throw new Error('Personio auth: kein Token');
  return token;
}

async function fetchAllPaged(url: string, token: string): Promise<any[]> {
  // Personio liefert auf einigen Endpunkten paginiert (limit/offset).
  const out: any[] = [];
  let offset = 0;
  const limit = 200;
  for (let i = 0; i < 50; i++) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}limit=${limit}&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Personio fetch [${res.status}]: ${await res.text()}`);
    const json = await res.json();
    const arr = Array.isArray(json?.data) ? json.data : [];
    out.push(...arr);
    if (arr.length < limit) break;
    offset += limit;
  }
  return out;
}

function toMinutes(hms: string | null | undefined): number {
  if (!hms) return 0;
  const [h, m] = String(hms).split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function categorizeAbsence(name: string): string {
  const n = (name || '').toLowerCase();
  if (/urlaub|vacation|holiday/.test(n)) return 'vacation';
  if (/krank|sick|ill/.test(n)) return 'sick';
  if (/eltern|parental|mutterschutz|maternity/.test(n)) return 'parental';
  return 'other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Authentifizierung: Admin-User ODER service-role (für cron)
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!isServiceRole) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return j(401, { error: 'Unauthorized' });
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return j(403, { error: 'Admins only' });
  }

  // Credentials laden
  const { data: settingsRow } = await admin
    .from('integration_settings').select('config').eq('id', 'personio').maybeSingle();
  const cfg = (settingsRow?.config as Record<string, string> | undefined) || {};
  const clientId = cfg.client_id || Deno.env.get('PERSONIO_CLIENT_ID');
  const clientSecret = cfg.client_secret || Deno.env.get('PERSONIO_CLIENT_SECRET');
  const baseUrl = cfg.base_url || 'https://api.personio.de';
  if (!clientId || !clientSecret) {
    return j(412, { error: 'Personio-Credentials fehlen', hint: 'Admin → Personio → Zugangsdaten' });
  }

  let body: { days_back?: number; days_forward?: number } = {};
  try { body = await req.json(); } catch { /* leerer Body ok */ }
  const daysBack = body.days_back ?? 400;       // ein Jahr+ für Jahresaggregate
  const daysForward = body.days_forward ?? 60;  // geplante Urlaube

  const start = new Date(); start.setDate(start.getDate() - daysBack);
  const end = new Date();   end.setDate(end.getDate() + daysForward);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  try {
    const personioToken = await getAccessToken(baseUrl, clientId, clientSecret);

    // 1) Employee-Mapping aktualisieren: alle Personio-Mitarbeitende → users_profile via E-Mail
    const employees = await fetchAllPaged(`${baseUrl}/v1/company/employees`, personioToken);
    const emailToPersonioId = new Map<string, string>();
    for (const emp of employees) {
      const email = String(attr<string>(emp, 'email') || '').trim().toLowerCase();
      const pid = attr<string | number>(emp, 'id');
      if (email && pid != null) emailToPersonioId.set(email, String(pid));
    }

    // Mapping in DB synchronisieren
    const { data: authList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const mapRows: { user_id: string; personio_employee_id: string; email: string }[] = [];
    for (const u of (authList?.users || [])) {
      const email = (u.email || '').toLowerCase();
      const pid = emailToPersonioId.get(email);
      if (pid) mapRows.push({ user_id: u.id, personio_employee_id: pid, email });
    }
    if (mapRows.length > 0) {
      await admin.from('personio_employee_map').upsert(mapRows, { onConflict: 'user_id' });
    }

    const personioIdToUser = new Map<string, string>();
    for (const r of mapRows) personioIdToUser.set(r.personio_employee_id, r.user_id);

    // 2) Anwesenheiten
    let attCount = 0;
    const attendances = await fetchAllPaged(
      `${baseUrl}/v1/company/attendances?start_date=${startStr}&end_date=${endStr}`,
      personioToken,
    );
    const attRows: any[] = [];
    for (const a of attendances) {
      const at = a?.attributes || {};
      const pid = String(at.employee ?? '');
      const userId = personioIdToUser.get(pid);
      if (!userId) continue;
      attRows.push({
        user_id: userId,
        personio_attendance_id: String(a.id ?? `${pid}-${at.date}-${at.start_time}`),
        work_date: at.date,
        start_time: at.start_time || null,
        end_time: at.end_time || null,
        break_minutes: Number(at.break ?? 0),
        worked_minutes:
          (toMinutes(at.end_time) - toMinutes(at.start_time)) - Number(at.break ?? 0),
        comment: at.comment || null,
        source: 'personio',
      });
    }
    // Batch upsert
    for (let i = 0; i < attRows.length; i += 500) {
      const chunk = attRows.slice(i, i + 500);
      const { error } = await admin
        .from('personio_attendances')
        .upsert(chunk, { onConflict: 'personio_attendance_id' });
      if (error) throw new Error(`attendances upsert: ${error.message}`);
      attCount += chunk.length;
    }

    // 3) Abwesenheiten
    let absCount = 0;
    const absences = await fetchAllPaged(
      `${baseUrl}/v1/company/time-offs?start_date=${startStr}&end_date=${endStr}`,
      personioToken,
    );
    const absRows: any[] = [];
    for (const ab of absences) {
      const at = ab?.attributes || {};
      const empVal = at.employee?.attributes?.id?.value ?? at.employee;
      const pid = String(empVal ?? '');
      const userId = personioIdToUser.get(pid);
      if (!userId) continue;
      const typeName =
        at.time_off_type?.attributes?.name ||
        at.certificate?.status ||
        'Abwesenheit';
      absRows.push({
        user_id: userId,
        personio_absence_id: String(ab.id ?? `${pid}-${at.start_date}-${at.end_date}`),
        absence_type: String(typeName),
        category: categorizeAbsence(String(typeName)),
        start_date: at.start_date,
        end_date: at.end_date,
        half_day_start: !!at.half_day_start,
        half_day_end: !!at.half_day_end,
        days_count: Number(at.days_count ?? 0),
        status: at.status || (at.approved ? 'approved' : 'pending'),
        comment: at.comment || null,
        source: 'personio',
      });
    }
    for (let i = 0; i < absRows.length; i += 500) {
      const chunk = absRows.slice(i, i + 500);
      const { error } = await admin
        .from('personio_absences')
        .upsert(chunk, { onConflict: 'personio_absence_id' });
      if (error) throw new Error(`absences upsert: ${error.message}`);
      absCount += chunk.length;
    }

    // Letzten Sync-Zeitstempel zurückschreiben
    await admin.from('integration_settings').upsert({
      id: 'personio',
      config: {
        ...cfg,
        last_attendance_sync_at: new Date().toISOString(),
        last_attendance_count: attCount,
        last_absence_count: absCount,
      },
    });

    return j(200, {
      ok: true,
      mapped_users: mapRows.length,
      attendances: attCount,
      absences: absCount,
      window: { start: startStr, end: endStr },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Sync fehlgeschlagen';
    console.error('[sync-personio-attendance]', msg);
    return j(500, { ok: false, error: msg });
  }
});

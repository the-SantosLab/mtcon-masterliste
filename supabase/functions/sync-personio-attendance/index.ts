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

// --- Personio API V2 (Attendances: V1 ist abgekündigt) ---

async function getV2Token(baseUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${baseUrl}/v2/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`Personio v2 auth [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const token = data?.access_token;
  if (!token) throw new Error('Personio v2 auth: kein Token');
  return token;
}

async function fetchV2Paged(url: string, token: string): Promise<any[]> {
  // V2 nutzt Cursor-Pagination (_meta.links.next bzw. cursor-Parameter).
  const out: any[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 100; i++) {
    const sep = url.includes('?') ? '&' : '?';
    const pageUrl = `${url}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    let res = await fetch(pageUrl, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    // 429: kurz warten und bis zu 3x erneut versuchen
    for (let retry = 0; res.status === 429 && retry < 3; retry++) {
      const wait = Number(res.headers.get('Retry-After')) || 5;
      await new Promise((r) => setTimeout(r, Math.min(wait, 20) * 1000));
      res = await fetch(pageUrl, {
        headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
      });
    }
    if (!res.ok) throw new Error(`Personio v2 fetch [${res.status}]: ${await res.text()}`);
    const json = await res.json();
    const arr = Array.isArray(json?._data) ? json._data : [];
    out.push(...arr);
    const next: string | undefined = json?._meta?.links?.next?.href || json?._meta?.links?.next;
    if (!next || arr.length === 0) break;
    try {
      cursor = new URL(next, baseOf(url)).searchParams.get('cursor');
    } catch {
      cursor = null;
    }
    if (!cursor) break;
  }
  return out;
}

function baseOf(url: string): string {
  try { return new URL(url).origin; } catch { return 'https://api.personio.de'; }
}

function hhmm(dateTime: string | null | undefined): string | null {
  if (!dateTime) return null;
  const s = String(dateTime);
  // "2026-06-11T08:30:00+02:00" → "08:30" (lokale Zeit aus dem String, kein TZ-Shift)
  return s.length >= 16 ? s.slice(11, 16) : null;
}

function minutesBetween(startIso: string, endIso: string | null): number {
  const s = new Date(startIso).getTime();
  const e = endIso ? new Date(endIso).getTime() : Date.now();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.round((e - s) / 60000);
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

  // Authentifizierung: Admin-User ODER service-role ODER cron-secret (für pg_cron)
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const isServiceRole = token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = req.headers.get('x-cron-secret') || '';
  const isCron = cronSecret && cronSecret === (Deno.env.get('CRON_SECRET') || 'MtCon2026!');

  if (!isServiceRole && !isCron) {
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
  const daysBack = body.days_back ?? 90;        // Default: 90 Tage; für Initial-Seed höher setzen
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

    // 2) Anwesenheiten – via API V2 (V1 /company/attendances ist abgekündigt)
    let attCount = 0;
    const v2Token = await getV2Token(baseUrl, clientId, clientSecret);
    const periods = await fetchV2Paged(
      `${baseUrl}/v2/attendance-periods?start.date_time.gte=${encodeURIComponent(`${startStr}T00:00:00`)}&start.date_time.lte=${encodeURIComponent(`${endStr}T23:59:59`)}`,
      v2Token,
    );

    // Pro Person & Tag aggregieren (WORK-/BREAK-Perioden zusammenfassen)
    type DayAgg = {
      user_id: string; pid: string; date: string;
      firstStart: string | null; lastEnd: string | null; open: boolean;
      worked: number; brk: number; comments: string[];
    };
    const byDay = new Map<string, DayAgg>();
    // Berliner Zeitzone (Personio-Server) — Personio liefert naive Datetimes ohne TZ,
    // die tatsächlich lokale (Berliner) Uhrzeit sind. Ein Vergleich mit Date.now()
    // in UTC würde offene Perioden fälschlich als "Zukunft" verwerfen. Wir filtern
    // daher nur nach Datum (attribution_date > heute in Berliner Zeit).
    const todayBerlin = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Berlin',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    let skippedFuture = 0;
    for (const p of periods) {
      const pid = String(p?.person?.id ?? '');
      const userId = personioIdToUser.get(pid);
      if (!userId) continue;
      const startIso: string | null = p?.start?.date_time ?? null;
      if (!startIso) continue;
      const endIso: string | null = p?.end?.date_time ?? null;
      const date: string = p?.attribution_date || String(startIso).slice(0, 10);
      // Zukunfts-Perioden (geplante Sollzeiten) verwerfen — rein datumsbasiert,
      // damit offene Perioden am heutigen Tag NICHT durch UTC/Local-Drift rausfallen.
      if (date > todayBerlin) {
        skippedFuture++;
        continue;
      }
      const key = `${pid}-${date}`;
      let agg = byDay.get(key);
      if (!agg) {
        agg = { user_id: userId, pid, date, firstStart: null, lastEnd: null, open: false, worked: 0, brk: 0, comments: [] };
        byDay.set(key, agg);
      }
      const mins = minutesBetween(startIso, endIso);
      if (String(p?.type).toUpperCase() === 'BREAK') {
        agg.brk += mins;
      } else {
        agg.worked += mins;
        const st = hhmm(startIso);
        const en = hhmm(endIso);
        if (st && (!agg.firstStart || st < agg.firstStart)) agg.firstStart = st;
        if (en && (!agg.lastEnd || en > agg.lastEnd)) agg.lastEnd = en;
        if (!endIso) agg.open = true;
        if (p?.comment) agg.comments.push(String(p.comment));
      }
    }

    const attRows: any[] = [];
    for (const agg of byDay.values()) {
      attRows.push({
        user_id: agg.user_id,
        personio_attendance_id: `${agg.pid}-${agg.date}`,
        work_date: agg.date,
        start_time: agg.firstStart,
        end_time: agg.open ? null : agg.lastEnd,
        break_minutes: agg.brk,
        worked_minutes: agg.worked,
        comment: agg.comments.length ? agg.comments.join(' | ') : null,
        source: 'personio',
      });
    }
    // Dedupe attendances (defensiv – sollte unique sein, aber sicher ist sicher)
    const attDedup = Array.from(
      new Map(attRows.map((r) => [r.personio_attendance_id, r])).values(),
    );
    // Batch upsert
    for (let i = 0; i < attDedup.length; i += 500) {
      const chunk = attDedup.slice(i, i + 500);
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
    // Dedupe: Personio liefert in paginierten Antworten gelegentlich denselben
    // time-off-Eintrag mehrfach. Postgres bricht sonst mit
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" ab.
    const absDedup = Array.from(
      new Map(absRows.map((r) => [r.personio_absence_id, r])).values(),
    );
    for (let i = 0; i < absDedup.length; i += 500) {
      const chunk = absDedup.slice(i, i + 500);
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

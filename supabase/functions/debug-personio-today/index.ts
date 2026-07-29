// Debug-only: dumps today's raw Personio v2 attendance-periods for one or all persons.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // admin only
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return new Response(JSON.stringify({ error: 'unauth' }), { status: 401, headers: cors });
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!role) return new Response(JSON.stringify({ error: 'admins only' }), { status: 403, headers: cors });

  const { data: s } = await admin.from('integration_settings').select('config').eq('id', 'personio').maybeSingle();
  const cfg = (s?.config as any) || {};
  const baseUrl = cfg.base_url || 'https://api.personio.de';

  const authRes = await fetch(`${baseUrl}/v2/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.client_id, client_secret: cfg.client_secret }),
  });
  const tok = (await authRes.json())?.access_token;

  const today = new Date().toISOString().slice(0, 10);
  const url = `${baseUrl}/v2/attendance-periods?start.date_time.gte=${encodeURIComponent(today + 'T00:00:00')}&start.date_time.lte=${encodeURIComponent(today + 'T23:59:59')}&limit=100`;

  const all: any[] = [];
  let next: string | null = url;
  for (let i = 0; i < 20 && next; i++) {
    const r = await fetch(next, { headers: { Authorization: `Bearer ${tok}`, accept: 'application/json' } });
    const j = await r.json();
    all.push(...(j?._data || []));
    const nh = j?._meta?.links?.next?.href || j?._meta?.links?.next;
    next = nh ? new URL(nh, baseUrl).toString() : null;
  }

  // group by person.id
  const byPerson: Record<string, any[]> = {};
  for (const p of all) {
    const pid = String(p?.person?.id ?? 'unknown');
    (byPerson[pid] ||= []).push({
      type: p?.type,
      start: p?.start?.date_time,
      end: p?.end?.date_time,
      attribution_date: p?.attribution_date,
      comment: p?.comment,
      id: p?.id,
    });
  }

  // enrich with names via employees v1
  const emp = await fetch(`${baseUrl}/v1/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: cfg.client_id, client_secret: cfg.client_secret }) });
  const v1tok = (await emp.json())?.data?.token;
  const empRes = await fetch(`${baseUrl}/v1/company/employees?limit=200`, { headers: { Authorization: `Bearer ${v1tok}` } });
  const empList = (await empRes.json())?.data || [];
  const nameById: Record<string, string> = {};
  for (const e of empList) {
    const id = String(e?.attributes?.id?.value ?? '');
    const first = e?.attributes?.first_name?.value ?? '';
    const last = e?.attributes?.last_name?.value ?? '';
    if (id) nameById[id] = `${first} ${last}`.trim();
  }

  const summary = Object.entries(byPerson).map(([pid, periods]) => ({
    pid,
    name: nameById[pid] || '?',
    periods,
  })).sort((a, b) => a.name.localeCompare(b.name));

  return new Response(JSON.stringify({ date: today, total_periods: all.length, persons: summary.length, summary }, null, 2), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const TABLES = [
  'departments','users_profile','user_roles','department_permissions',
  'customers','products','internal_areas','workflow_settings','counters',
  'projects','project_members','project_folders','project_activity',
  'cases','case_tasks','case_activity',
  'portal_customers','support_tickets','ticket_messages',
  'response_templates','notifications',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth: cron secret OR admin JWT
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = !!cronSecret && cronSecret === Deno.env.get('BACKUP_CRON_SECRET');

  let trigger: 'schedule' | 'manual' | 'pre_restore' = 'schedule';
  let note: string | null = null;
  let createdBy: string | null = null;

  if (!isCron) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims } = await userClient.auth.getClaims(token);
    if (!claims?.claims) return json({ error: 'Unauthorized' }, 401);
    createdBy = claims.claims.sub;
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', createdBy).eq('role', 'admin').maybeSingle();
    if (!roleRow) return json({ error: 'Forbidden' }, 403);

    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    trigger = (body?.trigger === 'pre_restore' ? 'pre_restore' : 'manual');
    note = body?.note ?? null;
  }

  try {
    const snapshot: Record<string, any[]> = {};
    let totalRows = 0;
    for (const t of TABLES) {
      const all: any[] = [];
      let from = 0;
      const batch = 1000;
      while (true) {
        const { data, error } = await admin.from(t).select('*').range(from, from + batch - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < batch) break;
        from += batch;
      }
      snapshot[t] = all;
      totalRows += all.length;
    }

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fname = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}_${trigger}.json`;
    const payload = { version: 1, created_at: now.toISOString(), trigger, tables: TABLES, data: snapshot };
    const body = new TextEncoder().encode(JSON.stringify(payload));

    const { error: upErr } = await admin.storage.from('backups').upload(fname, body, {
      contentType: 'application/json', upsert: false,
    });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await admin.from('backups').insert({
      created_by: createdBy,
      trigger,
      storage_path: fname,
      size_bytes: body.byteLength,
      tables_count: TABLES.length,
      rows_count: totalRows,
      status: 'success',
      note,
    }).select().single();
    if (insErr) throw insErr;

    return json({ ok: true, backup: row });
  } catch (err: any) {
    console.error('create-backup error', err);
    await admin.from('backups').insert({
      created_by: createdBy, trigger, storage_path: '', status: 'failed',
      tables_count: TABLES.length, rows_count: 0, error: String(err?.message || err), note,
    });
    return json({ error: err?.message || 'Backup failed' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

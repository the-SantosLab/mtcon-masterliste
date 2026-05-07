import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Restore order respects logical dependencies (parents before children)
const RESTORE_ORDER = [
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

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims } = await userClient.auth.getClaims(token);
  if (!claims?.claims) return json({ error: 'Unauthorized' }, 401);
  const uid = claims.claims.sub;
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
  if (!roleRow) return json({ error: 'Forbidden' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid body' }, 400); }
  const backupId = body?.backup_id;
  if (!backupId) return json({ error: 'backup_id required' }, 400);

  try {
    const { data: backup, error: bErr } = await admin.from('backups').select('*').eq('id', backupId).single();
    if (bErr || !backup) throw new Error('Backup nicht gefunden');

    // Pre-restore safety backup
    const preRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': Deno.env.get('BACKUP_CRON_SECRET') ?? '',
      },
      body: JSON.stringify({}),
    });
    // Note: cron path produces trigger=schedule; mark via direct insert if we want pre_restore label
    await preRes.text();

    // Download the backup file
    const { data: file, error: dErr } = await admin.storage.from('backups').download(backup.storage_path);
    if (dErr || !file) throw new Error('Backup-Datei kann nicht geladen werden');
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = payload.data as Record<string, any[]>;

    // Wipe in reverse order, then insert in forward order
    for (const t of [...RESTORE_ORDER].reverse()) {
      const { error } = await admin.from(t).delete().not('id', 'is', null);
      if (error && !/no rows|0 rows/i.test(error.message)) {
        // counters has no id col? it does. continue otherwise
        console.warn(`wipe ${t}:`, error.message);
      }
    }

    let inserted = 0;
    for (const t of RESTORE_ORDER) {
      const rows = data[t];
      if (!rows || rows.length === 0) continue;
      // Insert in chunks to avoid payload limits
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const { error } = await admin.from(t).insert(slice);
        if (error) throw new Error(`Wiederherstellung ${t}: ${error.message}`);
        inserted += slice.length;
      }
    }

    return json({ ok: true, inserted });
  } catch (err: any) {
    console.error('restore-backup error', err);
    return json({ error: err?.message || 'Restore failed' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

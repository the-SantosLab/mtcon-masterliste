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
  'documents','document_versions','document_links','document_types',
  'case_chat_attachments','case_note_attachments','case_email_attachments',
  'inbox_documents','insurance_documents','issos_documents','order_documents',
  'mtiq_draft_attachments','drawings','drawing_versions',
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
  const skipFiles = body?.skip_files === true;
  const wipeBuckets = body?.wipe_buckets !== false; // default: leere Ziel-Buckets vor Restore
  if (!backupId) return json({ error: 'backup_id required' }, 400);

  const startedAt = Date.now();
  let runId: string | null = null;

  try {
    const { data: backup, error: bErr } = await admin.from('backups').select('*').eq('id', backupId).single();
    if (bErr || !backup) throw new Error('Backup nicht gefunden');

    const { data: runRow } = await admin.from('restore_runs').insert({
      backup_id: backup.id,
      backup_created_at: backup.created_at,
      started_by: uid,
      status: 'running',
    }).select('id').single();
    runId = runRow?.id ?? null;


    // Pre-restore safety backup
    const preRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/create-backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': Deno.env.get('BACKUP_CRON_SECRET') ?? '',
      },
      body: JSON.stringify({ trigger: 'pre_restore', wait: true }),
    });
    await preRes.text();

    // Download the backup file
    const { data: file, error: dErr } = await admin.storage.from('backups').download(backup.storage_path);
    if (dErr || !file) throw new Error('Backup-Datei kann nicht geladen werden');
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = (payload.data ?? {}) as Record<string, any[]>;
    const tableData = payload.table_data as
      | { root: string; tables: Record<string, { chunks: string[]; rows: number }> }
      | undefined;
    const storage = payload.storage as
      | { root: string; buckets: string[]; files: Record<string, { path: string; size: number; dest: string }[]> }
      | undefined;

    // 1) DB wipe (reverse) + restore (forward)
    for (const t of [...RESTORE_ORDER].reverse()) {
      const { error } = await admin.from(t).delete().not('id', 'is', null);
      if (error) console.warn(`wipe ${t}:`, error.message);
    }

    let inserted = 0;
    for (const t of RESTORE_ORDER) {
      // v3: Tabellendaten liegen als Chunk-Dateien im Storage
      const chunks = tableData?.tables?.[t]?.chunks;
      if (chunks && chunks.length) {
        for (const c of chunks) {
          const { data: blob, error: cErr } = await admin.storage.from('backups').download(c);
          if (cErr || !blob) throw new Error(`Chunk ${c} nicht lesbar`);
          const rows = JSON.parse(await blob.text()) as any[];
          for (let i = 0; i < rows.length; i += 500) {
            const slice = rows.slice(i, i + 500);
            const { error } = await admin.from(t).insert(slice);
            if (error) throw new Error(`Wiederherstellung ${t}: ${error.message}`);
            inserted += slice.length;
          }
        }
        continue;
      }
      const rows = data[t];
      if (!rows || rows.length === 0) continue;
      const chunk = 500;
      for (let i = 0; i < rows.length; i += chunk) {
        const slice = rows.slice(i, i + chunk);
        const { error } = await admin.from(t).insert(slice);
        if (error) throw new Error(`Wiederherstellung ${t}: ${error.message}`);
        inserted += slice.length;
      }
    }


    // 2) Dateien wiederherstellen
    let filesRestored = 0;
    let filesFailed = 0;
    let bytesRestored = 0;
    const failedSamples: string[] = [];

    if (!skipFiles && storage?.files && storage?.root) {
      for (const [bucket, entries] of Object.entries(storage.files)) {
        if (!entries || entries.length === 0) continue;

        // Optional: Ziel-Bucket leeren, damit gelöschte Dateien nicht "wieder auferstehen".
        if (wipeBuckets) {
          try {
            const toDelete: string[] = [];
            const stack: string[] = [''];
            while (stack.length) {
              const cur = stack.pop()!;
              let offset = 0;
              const limit = 1000;
              while (true) {
                const { data: list, error: lErr } = await admin.storage.from(bucket).list(cur, {
                  limit, offset, sortBy: { column: 'name', order: 'asc' },
                });
                if (lErr) { console.warn(`wipe list ${bucket}/${cur}: ${lErr.message}`); break; }
                if (!list || list.length === 0) break;
                for (const it of list) {
                  const full = cur ? `${cur}/${it.name}` : it.name;
                  if (it.id === null || !it.metadata) stack.push(full);
                  else toDelete.push(full);
                }
                if (list.length < limit) break;
                offset += limit;
              }
            }
            for (let i = 0; i < toDelete.length; i += 500) {
              const slice = toDelete.slice(i, i + 500);
              const { error: rmErr } = await admin.storage.from(bucket).remove(slice);
              if (rmErr) console.warn(`wipe remove ${bucket}: ${rmErr.message}`);
            }
          } catch (e: any) {
            console.warn(`wipe bucket ${bucket}: ${e?.message}`);
          }
        }

        // Parallel-Kopie aus backups/<dest> zurück in <bucket>/<path>
        const concurrency = 6;
        let idx = 0;
        const worker = async () => {
          while (idx < entries.length) {
            const my = idx++;
            const it = entries[my];
            try {
              const { data: blob, error: dlErr } = await admin.storage.from('backups').download(it.dest);
              if (dlErr || !blob) throw new Error(dlErr?.message || 'download failed');
              const buf = new Uint8Array(await blob.arrayBuffer());
              const { error: upErr } = await admin.storage.from(bucket).upload(it.path, buf, {
                contentType: (blob as any).type || 'application/octet-stream',
                upsert: true,
              });
              if (upErr) throw upErr;
              filesRestored++;
              bytesRestored += buf.byteLength;
            } catch (e: any) {
              filesFailed++;
              if (failedSamples.length < 10) failedSamples.push(`${bucket}/${it.path}: ${e?.message}`);
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
      }
    }

    return json({
      ok: true,
      inserted,
      files_restored: filesRestored,
      files_failed: filesFailed,
      bytes_restored: bytesRestored,
      failed_samples: failedSamples,
      manifest_version: payload.version ?? 1,
    });
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

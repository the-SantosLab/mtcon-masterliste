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
  // Dokumenten-Metadaten (die Binärdateien liegen in Storage – siehe STORAGE_BUCKETS)
  'documents','document_versions','document_links','document_types',
  'case_chat_attachments','case_note_attachments','case_email_attachments',
  'inbox_documents','insurance_documents','issos_documents','order_documents',
  'mtiq_draft_attachments','drawings','drawing_versions',
];

// Alle Nutz-Buckets werden mitgesichert (backups/thumbs ausgenommen).
const STORAGE_BUCKETS = [
  'article-imports','avatars','case-attachments','documents','drawings',
  'inbox-documents','insurance-documents','issos-documents',
  'mtiq-draft-attachments','order-documents','project-files','support-attachments',
];

async function listAllFiles(admin: any, bucket: string, prefix = ''): Promise<{ path: string; size: number }[]> {
  const out: { path: string; size: number }[] = [];
  const stack: string[] = [prefix];
  while (stack.length) {
    const cur = stack.pop()!;
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(cur, {
        limit, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`list ${bucket}/${cur}: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const full = cur ? `${cur}/${item.name}` : item.name;
        // Ordner haben in Supabase Storage kein id/metadata
        if (item.id === null || !item.metadata) {
          stack.push(full);
        } else {
          out.push({ path: full, size: Number(item.metadata?.size ?? 0) });
        }
      }
      if (data.length < limit) break;
      offset += limit;
    }
  }
  return out;
}

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

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}_${trigger}`;
  const filesRoot = `files/${stamp}`;

  try {
    // 1) DB-Snapshot
    const snapshot: Record<string, any[]> = {};
    let totalRows = 0;
    for (const t of TABLES) {
      const all: any[] = [];
      let from = 0;
      const batch = 1000;
      while (true) {
        const { data, error } = await admin.from(t).select('*').range(from, from + batch - 1);
        if (error) {
          // Tabelle evtl. nicht vorhanden -> nur warnen, nicht abbrechen
          console.warn(`table ${t}: ${error.message}`);
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < batch) break;
        from += batch;
      }
      snapshot[t] = all;
      totalRows += all.length;
    }

    // 2) Storage-Snapshot: alle Buckets in den Backups-Bucket unter filesRoot spiegeln
    const filesManifest: Record<string, { path: string; size: number; dest: string }[]> = {};
    let totalFiles = 0;
    let totalFileBytes = 0;

    for (const bucket of STORAGE_BUCKETS) {
      let items: { path: string; size: number }[] = [];
      try {
        items = await listAllFiles(admin, bucket);
      } catch (e: any) {
        console.warn(`bucket ${bucket} list failed: ${e?.message}`);
        continue;
      }
      const entries: { path: string; size: number; dest: string }[] = [];
      // Parallel-Kopie in kleinen Batches, damit Speicher & Verbindung stabil bleiben
      const concurrency = 6;
      let idx = 0;
      async function worker() {
        while (idx < items.length) {
          const my = idx++;
          const it = items[my];
          const dest = `${filesRoot}/${bucket}/${it.path}`;
          try {
            const { data: blob, error: dErr } = await admin.storage.from(bucket).download(it.path);
            if (dErr || !blob) throw new Error(dErr?.message || 'download failed');
            const buf = new Uint8Array(await blob.arrayBuffer());
            const { error: uErr } = await admin.storage.from('backups').upload(dest, buf, {
              contentType: (blob as any).type || 'application/octet-stream',
              upsert: true,
            });
            if (uErr) throw uErr;
            entries.push({ path: it.path, size: buf.byteLength, dest });
            totalFileBytes += buf.byteLength;
            totalFiles++;
          } catch (e: any) {
            console.warn(`copy ${bucket}/${it.path}: ${e?.message}`);
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()));
      filesManifest[bucket] = entries;
    }

    // 3) Manifest / Payload schreiben
    const fname = `${stamp}.json`;
    const payload = {
      version: 2,
      created_at: now.toISOString(),
      trigger,
      tables: TABLES,
      data: snapshot,
      storage: {
        root: filesRoot,
        buckets: STORAGE_BUCKETS,
        files: filesManifest,
        total_files: totalFiles,
        total_bytes: totalFileBytes,
      },
    };
    const body = new TextEncoder().encode(JSON.stringify(payload));

    const { error: upErr } = await admin.storage.from('backups').upload(fname, body, {
      contentType: 'application/json', upsert: false,
    });
    if (upErr) throw upErr;

    const { data: row, error: insErr } = await admin.from('backups').insert({
      created_by: createdBy,
      trigger,
      storage_path: fname,
      size_bytes: body.byteLength + totalFileBytes,
      tables_count: TABLES.length,
      rows_count: totalRows,
      status: 'success',
      note: [note, `Dokumente: ${totalFiles} Dateien / ${(totalFileBytes/1024/1024).toFixed(1)} MB`].filter(Boolean).join(' · '),
    }).select().single();
    if (insErr) throw insErr;

    return json({ ok: true, backup: row, files: totalFiles, file_bytes: totalFileBytes });
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

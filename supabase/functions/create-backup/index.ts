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

type FileEntry = { path: string; size: number; dest: string };

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
  let wait = false;

  if (isCron) {
    let body: any = {};
    try { body = await req.json(); } catch (_) {}
    if (body?.trigger === 'pre_restore') trigger = 'pre_restore';
    note = body?.note ?? null;
    wait = trigger === 'pre_restore' || body?.wait === true;
  }

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
    // Vor einer Wiederherstellung muss synchron gewartet werden
    wait = trigger === 'pre_restore' || body?.wait === true;
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}_${trigger}`;

  // Laufenden Vorgang sofort protokollieren, damit ein Abbruch sichtbar bleibt
  const { data: runRow } = await admin.from('backups').insert({
    created_by: createdBy,
    trigger,
    storage_path: `${stamp}.json`,
    status: 'running',
    tables_count: TABLES.length,
    rows_count: 0,
    note,
  }).select().single();

  const work = runBackup(admin, { stamp, trigger, note, backupId: runRow?.id ?? null });

  if (wait) {
    const result = await work;
    return json(result.ok ? { ok: true, ...result } : { error: result.error }, result.ok ? 200 : 500);
  }

  // Im Hintergrund weiterlaufen lassen: pg_net bricht die Verbindung nach 5s ab
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch (_) { /* noop */ }
  return json({ ok: true, started: true, backup_id: runRow?.id ?? null });
});

async function runBackup(
  admin: any,
  opts: { stamp: string; trigger: string; note: string | null; backupId: string | null },
) {
  const { stamp, trigger, note, backupId } = opts;
  const filesRoot = `files/${stamp}`;
  const startedAt = new Date();

  try {
    // 1) DB-Snapshot – jede Tabelle wird in Blöcken direkt in den Storage geschrieben,
    //    damit nie der komplette Datenbestand im Speicher liegt (Memory-Limit).
    const tablesRoot = `tables/${stamp}`;
    const tablesManifest: Record<string, { chunks: string[]; rows: number }> = {};
    let totalRows = 0;
    for (const t of TABLES) {
      let from = 0;
      const batch = 500;
      let part = 0;
      let rows = 0;
      const chunks: string[] = [];
      while (true) {
        const { data, error } = await admin.from(t).select('*').range(from, from + batch - 1);
        if (error) {
          // Tabelle evtl. nicht vorhanden -> nur warnen, nicht abbrechen
          console.warn(`table ${t}: ${error.message}`);
          break;
        }
        if (!data || data.length === 0) break;
        const dest = `${tablesRoot}/${t}/${String(part).padStart(5, '0')}.json`;
        const bytes = new TextEncoder().encode(JSON.stringify(data));
        const { error: cErr } = await admin.storage.from('backups').upload(dest, bytes, {
          contentType: 'application/json', upsert: true,
        });
        if (cErr) throw new Error(`upload ${dest}: ${cErr.message}`);
        chunks.push(dest);
        rows += data.length;
        part++;
        const done = data.length < batch;
        if (done) break;
        from += batch;
      }
      tablesManifest[t] = { chunks, rows };
      totalRows += rows;
    }


    // 2) Storage-Snapshot – inkrementell: unveränderte Dateien werden aus dem
    //    letzten erfolgreichen Backup referenziert statt erneut kopiert.
    const prev = await loadPreviousManifest(admin);

    const filesManifest: Record<string, FileEntry[]> = {};
    let totalFiles = 0;
    let totalFileBytes = 0;
    let copiedFiles = 0;
    let reusedFiles = 0;

    for (const bucket of STORAGE_BUCKETS) {
      let items: { path: string; size: number }[] = [];
      try {
        items = await listAllFiles(admin, bucket);
      } catch (e: any) {
        console.warn(`bucket ${bucket} list failed: ${e?.message}`);
        continue;
      }
      const prevMap = new Map<string, FileEntry>();
      for (const e of (prev?.[bucket] ?? [])) prevMap.set(e.path, e);

      const entries: FileEntry[] = [];
      const concurrency = 4;
      let idx = 0;
      async function worker() {
        while (idx < items.length) {
          const it = items[idx++];
          const reuse = prevMap.get(it.path);
          if (reuse && reuse.size === it.size && reuse.dest) {
            entries.push({ path: it.path, size: it.size, dest: reuse.dest });
            totalFileBytes += it.size;
            totalFiles++; reusedFiles++;
            continue;
          }
          const dest = `${filesRoot}/${bucket}/${it.path}`;
          try {
            // Server-seitige Kopie: keine Datei landet im Funktionsspeicher
            const { error: cErr } = await admin.storage.from(bucket).copy(it.path, dest, {
              destinationBucket: 'backups',
            });
            if (cErr) throw cErr;
            entries.push({ path: it.path, size: it.size, dest });
            totalFileBytes += it.size;
            totalFiles++; copiedFiles++;
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
      version: 3,
      created_at: startedAt.toISOString(),
      trigger,
      tables: TABLES,
      table_data: { root: tablesRoot, tables: tablesManifest },

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
      contentType: 'application/json', upsert: true,
    });
    if (upErr) throw upErr;

    const finalNote = [
      note,
      `Dokumente: ${totalFiles} Dateien / ${(totalFileBytes/1024/1024).toFixed(1)} MB` +
      ` (${copiedFiles} neu, ${reusedFiles} übernommen)`,
    ].filter(Boolean).join(' · ');

    const patch = {
      storage_path: fname,
      size_bytes: body.byteLength + totalFileBytes,
      tables_count: TABLES.length,
      rows_count: totalRows,
      status: 'success',
      note: finalNote,
      error: null,
    };

    let row: any = null;
    if (backupId) {
      const { data } = await admin.from('backups').update(patch).eq('id', backupId).select().single();
      row = data;
    } else {
      const { data } = await admin.from('backups').insert({ trigger, ...patch }).select().single();
      row = data;
    }

    return { ok: true as const, backup: row, files: totalFiles, file_bytes: totalFileBytes };
  } catch (err: any) {
    console.error('create-backup error', err);
    const msg = String(err?.message || err);
    if (backupId) {
      await admin.from('backups').update({ status: 'failed', error: msg }).eq('id', backupId);
    } else {
      await admin.from('backups').insert({
        trigger, storage_path: '', status: 'failed',
        tables_count: TABLES.length, rows_count: 0, error: msg, note,
      });
    }
    return { ok: false as const, error: msg };
  }
}

async function loadPreviousManifest(admin: any): Promise<Record<string, FileEntry[]> | null> {
  try {
    const { data: last } = await admin
      .from('backups').select('storage_path')
      .eq('status', 'success').not('storage_path', 'eq', '')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!last?.storage_path) return null;
    const { data: blob, error } = await admin.storage.from('backups').download(last.storage_path);
    if (error || !blob) return null;
    // Alte v1/v2-Manifeste enthalten die kompletten Tabellendaten inline und
    // würden das Speicherlimit sprengen – nur schlanke v3-Manifeste wiederverwenden.
    if (blob.size > 8 * 1024 * 1024) return null;
    const parsed = JSON.parse(await blob.text());
    if ((parsed?.version ?? 0) < 3) return null;
    return parsed?.storage?.files ?? null;

  } catch (e: any) {
    console.warn('previous manifest unavailable:', e?.message);
    return null;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

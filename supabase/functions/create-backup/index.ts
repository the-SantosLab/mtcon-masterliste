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

// Ein Edge-Function-Lauf wird nach wenigen Minuten hart beendet. Deshalb arbeitet
// jeder Lauf nur bis zu diesem Zeitbudget und startet sich danach selbst neu.
const SLICE_MS = 120_000;
const MAX_ATTEMPTS = 60;

type FileEntry = { path: string; size: number; dest: string };
type Totals = { files: number; bytes: number; copied: number; reused: number };
type State = {
  stamp: string;
  trigger: string;
  note: string | null;
  phase: 'tables' | 'files' | 'finalize';
  tableIndex: number;
  tablesManifest: Record<string, { chunks: string[]; rows: number }>;
  totalRows: number;
  bucketIndex: number;
  fileIndex: number;
  totals: Totals;
  attempts: number;
  startedAt: string;
};

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

async function putJson(admin: any, path: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const { error } = await admin.storage.from('backups').upload(path, bytes, {
    contentType: 'application/json', upsert: true,
  });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return bytes.byteLength;
}

async function getJson(admin: any, path: string): Promise<any | null> {
  const { data, error } = await admin.storage.from('backups').download(path);
  if (error || !data) return null;
  try { return JSON.parse(await data.text()); } catch { return null; }
}

// Hängengebliebene Läufe (Worker abgeschossen) sichtbar machen statt ewig "Läuft…"
async function failStaleRuns(admin: any) {
  await admin.from('backups')
    .update({ status: 'failed', error: 'Abgebrochen – Hintergrundlauf wurde beendet' })
    .eq('status', 'running')
    .lt('updated_at', new Date(Date.now() - 20 * 60_000).toISOString());
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
  let body: any = {};

  if (isCron) {
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

    try { body = await req.json(); } catch (_) {}
    trigger = (body?.trigger === 'pre_restore' ? 'pre_restore' : 'manual');
    note = body?.note ?? null;
    // Vor einer Wiederherstellung muss synchron gewartet werden
    wait = trigger === 'pre_restore' || body?.wait === true;
  }

  // Fortsetzung eines laufenden Backups (Selbstaufruf)
  if (isCron && body?.resume) {
    const { data: row } = await admin.from('backups').select('*').eq('id', body.resume).maybeSingle();
    if (!row || row.status !== 'running' || !row.state) return json({ ok: true, skipped: true });
    const work = runSlice(admin, row.id, row.state as State);
    if (wait) { const r = await work; return json(r.ok ? r : { error: r.error }, r.ok ? 200 : 500); }
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch (_) { /* noop */ }
    return json({ ok: true, resumed: true, backup_id: row.id });
  }

  await failStaleRuns(admin);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}_${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}-${pad(now.getUTCSeconds())}_${trigger}`;

  const state: State = {
    stamp, trigger, note,
    phase: 'tables', tableIndex: 0, tablesManifest: {}, totalRows: 0,
    bucketIndex: 0, fileIndex: 0,
    totals: { files: 0, bytes: 0, copied: 0, reused: 0 },
    attempts: 0, startedAt: now.toISOString(),
  };

  // Laufenden Vorgang sofort protokollieren, damit ein Abbruch sichtbar bleibt
  const { data: runRow } = await admin.from('backups').insert({
    created_by: createdBy,
    trigger,
    storage_path: `${stamp}.json`,
    status: 'running',
    tables_count: TABLES.length,
    rows_count: 0,
    note,
    state,
    updated_at: now.toISOString(),
  }).select().single();

  const backupId = runRow?.id as string;

  if (wait) {
    // Synchron (z. B. vor einer Wiederherstellung): so lange Scheiben abarbeiten, bis fertig
    let cur: State | null = state;
    let last: any = null;
    while (cur) {
      last = await runSlice(admin, backupId, cur, true);
      if (!last.ok) return json({ error: last.error }, 500);
      cur = last.next ?? null;
    }
    return json({ ok: true, ...last });
  }

  const work = runSlice(admin, backupId, state);
  // Im Hintergrund weiterlaufen lassen: pg_net bricht die Verbindung nach 5s ab
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(work); } catch (_) { /* noop */ }
  return json({ ok: true, started: true, backup_id: backupId });
});

async function saveState(admin: any, backupId: string, state: State) {
  await admin.from('backups')
    .update({ state, rows_count: state.totalRows, updated_at: new Date().toISOString() })
    .eq('id', backupId);
}

async function selfInvoke(backupId: string) {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/create-backup`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-cron-secret': Deno.env.get('BACKUP_CRON_SECRET') ?? '',
      'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({ resume: backupId }),
  }).catch((e) => console.warn('self invoke failed', e?.message));
}

/** Arbeitet höchstens SLICE_MS lang und startet danach die nächste Scheibe. */
async function runSlice(admin: any, backupId: string, state: State, inline = false): Promise<any> {
  const deadline = Date.now() + SLICE_MS;
  const workRoot = `work/${state.stamp}`;
  state.attempts = (state.attempts ?? 0) + 1;

  try {
    if (state.attempts > MAX_ATTEMPTS) throw new Error('Backup abgebrochen: zu viele Fortsetzungen');

    // 1) DB-Snapshot – jede Tabelle wird in Blöcken direkt in den Storage geschrieben,
    //    damit nie der komplette Datenbestand im Speicher liegt (Memory-Limit).
    if (state.phase === 'tables') {
      const tablesRoot = `tables/${state.stamp}`;
      while (state.tableIndex < TABLES.length) {
        const t = TABLES[state.tableIndex];
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
          await putJson(admin, dest, data);
          chunks.push(dest);
          rows += data.length;
          part++;
          if (data.length < batch) break;
          from += batch;
        }
        state.tablesManifest[t] = { chunks, rows };
        state.totalRows += rows;
        state.tableIndex++;
        if (Date.now() > deadline) return await pause(admin, backupId, state, inline);
      }
      state.phase = 'files';
      await saveState(admin, backupId, state);
    }

    // 2) Storage-Snapshot – inkrementell: unveränderte Dateien werden aus dem
    //    letzten erfolgreichen Backup referenziert statt erneut kopiert.
    if (state.phase === 'files') {
      const prev = await loadPreviousManifest(admin);
      const filesRoot = `files/${state.stamp}`;

      while (state.bucketIndex < STORAGE_BUCKETS.length) {
        const bucket = STORAGE_BUCKETS[state.bucketIndex];
        const itemsPath = `${workRoot}/items-${bucket}.json`;
        const entriesPath = `${workRoot}/entries-${bucket}.json`;

        let items: { path: string; size: number }[] | null = state.fileIndex > 0
          ? await getJson(admin, itemsPath)
          : null;
        if (!items) {
          try {
            items = await listAllFiles(admin, bucket);
          } catch (e: any) {
            console.warn(`bucket ${bucket} list failed: ${e?.message}`);
            items = [];
          }
          await putJson(admin, itemsPath, items);
          state.fileIndex = 0;
        }

        const entries: FileEntry[] = (state.fileIndex > 0 ? await getJson(admin, entriesPath) : null) ?? [];
        const prevMap = new Map<string, FileEntry>();
        for (const e of (prev?.[bucket] ?? [])) prevMap.set(e.path, e);

        let idx = state.fileIndex;
        let out = false;
        const concurrency = 4;
        async function worker() {
          while (true) {
            if (Date.now() > deadline) { out = true; return; }
            const myIdx = idx++;
            if (myIdx >= items!.length) return;
            const it = items![myIdx];
            const reuse = prevMap.get(it.path);
            if (reuse && reuse.size === it.size && reuse.dest) {
              entries.push({ path: it.path, size: it.size, dest: reuse.dest });
              state.totals.bytes += it.size;
              state.totals.files++; state.totals.reused++;
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
              state.totals.bytes += it.size;
              state.totals.files++; state.totals.copied++;
            } catch (e: any) {
              console.warn(`copy ${bucket}/${it.path}: ${e?.message}`);
            }
          }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()));

        await putJson(admin, entriesPath, entries);
        state.fileIndex = Math.min(idx, items.length);

        if (out && state.fileIndex < items.length) {
          return await pause(admin, backupId, state, inline);
        }
        state.bucketIndex++;
        state.fileIndex = 0;
        if (Date.now() > deadline) return await pause(admin, backupId, state, inline);
      }
      state.phase = 'finalize';
      await saveState(admin, backupId, state);
    }

    // 3) Manifest / Payload schreiben
    const filesManifest: Record<string, FileEntry[]> = {};
    for (const bucket of STORAGE_BUCKETS) {
      filesManifest[bucket] = (await getJson(admin, `${workRoot}/entries-${bucket}.json`)) ?? [];
    }

    const fname = `${state.stamp}.json`;
    const payload = {
      version: 3,
      created_at: state.startedAt,
      trigger: state.trigger,
      tables: TABLES,
      table_data: { root: `tables/${state.stamp}`, tables: state.tablesManifest },
      storage: {
        root: `files/${state.stamp}`,
        buckets: STORAGE_BUCKETS,
        files: filesManifest,
        total_files: state.totals.files,
        total_bytes: state.totals.bytes,
      },
    };
    const bodyLen = await putJson(admin, fname, payload);

    const finalNote = [
      state.note,
      `Dokumente: ${state.totals.files} Dateien / ${(state.totals.bytes/1024/1024).toFixed(1)} MB` +
      ` (${state.totals.copied} neu, ${state.totals.reused} übernommen)`,
    ].filter(Boolean).join(' · ');

    const { data: row } = await admin.from('backups').update({
      storage_path: fname,
      size_bytes: bodyLen + state.totals.bytes,
      tables_count: TABLES.length,
      rows_count: state.totalRows,
      status: 'success',
      note: finalNote,
      error: null,
      state: null,
      updated_at: new Date().toISOString(),
    }).eq('id', backupId).select().single();

    // Arbeitsdateien aufräumen (best effort)
    try {
      const paths: string[] = [];
      for (const b of STORAGE_BUCKETS) paths.push(`${workRoot}/items-${b}.json`, `${workRoot}/entries-${b}.json`);
      await admin.storage.from('backups').remove(paths);
    } catch (_) { /* noop */ }

    return { ok: true as const, backup: row, files: state.totals.files, file_bytes: state.totals.bytes, next: null };
  } catch (err: any) {
    console.error('create-backup error', err);
    const msg = String(err?.message || err);
    await admin.from('backups')
      .update({ status: 'failed', error: msg, state: null, updated_at: new Date().toISOString() })
      .eq('id', backupId);
    return { ok: false as const, error: msg };
  }
}

async function pause(admin: any, backupId: string, state: State, inline: boolean) {
  await saveState(admin, backupId, state);
  if (inline) return { ok: true as const, paused: true, next: state };
  await selfInvoke(backupId);
  return { ok: true as const, paused: true, next: null };
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

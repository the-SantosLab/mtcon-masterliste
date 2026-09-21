// Kleiner Prozess-Cache für Daten des App-Rahmens (Seitenleiste, Glocke, Zugriffsrechte).
// Der Rahmen wird bei jedem Seitenwechsel neu aufgebaut; ohne Cache würden die
// immer gleichen Abfragen jedes Mal erneut laufen.

interface Entry<T = unknown> {
  ts: number;
  value: T;
  inflight?: Promise<T>;
}

const store = new Map<string, Entry>();

export const SHELL_TTL = 60_000;

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  return e ? (e.value as T) : undefined;
}

export function invalidateShellCache(prefix?: string) {
  if (!prefix) { store.clear(); return; }
  for (const k of Array.from(store.keys())) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/**
 * Liefert den zwischengespeicherten Wert, solange er jünger als ttl ist.
 * Parallele Aufrufe teilen sich eine laufende Anfrage.
 */
export async function cachedFetch<T>(
  key: string,
  fn: () => Promise<T>,
  opts?: { ttl?: number; force?: boolean },
): Promise<T> {
  const ttl = opts?.ttl ?? SHELL_TTL;
  const existing = store.get(key) as Entry<T> | undefined;
  if (!opts?.force && existing) {
    if (existing.inflight) return existing.inflight;
    if (Date.now() - existing.ts < ttl) return existing.value;
  }
  if (existing?.inflight && !opts?.force) return existing.inflight;

  const promise = (async () => {
    const value = await fn();
    store.set(key, { ts: Date.now(), value });
    return value;
  })();

  store.set(key, { ts: existing?.ts ?? 0, value: existing?.value as T, inflight: promise });
  try {
    return await promise;
  } catch (err) {
    store.delete(key);
    throw err;
  }
}

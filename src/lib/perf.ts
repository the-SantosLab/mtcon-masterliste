// Leichtgewichtiges Perf-Instrument: sammelt Route-, Query- und Render-Timings
// in einem Ring-Buffer im Speicher. Nur aktiv, wenn install() aufgerufen wurde.
// Kein Netzwerk, keine Persistenz. Konsumiert von <PerfPanel />.

export type PerfKind = 'route' | 'query' | 'render' | 'mark';

export interface PerfEvent {
  id: number;
  ts: number;           // epoch ms
  kind: PerfKind;
  label: string;        // Route-Pfad, Tabelle/Endpoint, Component-ID
  duration: number;     // ms
  detail?: string;      // z.B. Methode, HTTP-Status, Phase
}

const BUFFER_SIZE = 300;
let buffer: PerfEvent[] = [];
let snapshot: PerfEvent[] = [];
let seq = 0;
const listeners = new Set<() => void>();
let installed = false;

function push(ev: Omit<PerfEvent, 'id' | 'ts'>) {
  const e: PerfEvent = { id: ++seq, ts: Date.now(), ...ev };
  buffer.push(e);
  if (buffer.length > BUFFER_SIZE) buffer = buffer.slice(-BUFFER_SIZE);
  snapshot = buffer.slice().reverse();
  listeners.forEach(l => { try { l(); } catch { /* noop */ } });
}

export const perf = {
  install() {
    if (installed) return;
    installed = true;
    // Fetch-Wrap: nur Supabase-URLs messen, um Rauschen niedrig zu halten.
    const supaHost = (() => {
      try { return new URL(import.meta.env.VITE_SUPABASE_URL as string).host; }
      catch { return ''; }
    })();
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method ?? (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') ?? 'GET').toUpperCase();
      let host = '';
      try { host = new URL(url, window.location.origin).host; } catch { /* noop */ }
      const isSupa = !!supaHost && host === supaHost;
      const t0 = performance.now();
      try {
        const res = await originalFetch(input as RequestInfo, init);
        if (isSupa) {
          const d = performance.now() - t0;
          const path = (() => { try { return new URL(url).pathname.replace('/rest/v1/', '').replace('/functions/v1/', 'fn:'); } catch { return url; } })();
          push({ kind: 'query', label: path, duration: d, detail: `${method} ${res.status}` });
        }
        return res;
      } catch (err) {
        if (isSupa) {
          const d = performance.now() - t0;
          push({ kind: 'query', label: url, duration: d, detail: `${method} ERR` });
        }
        throw err;
      }
    };
  },
  mark(label: string, duration: number, detail?: string) {
    push({ kind: 'mark', label, duration, detail });
  },
  route(path: string, duration: number) {
    push({ kind: 'route', label: path, duration });
  },
  render(id: string, duration: number, phase: string) {
    if (duration < 16) return; // nur „langsame" Commits > 16ms
    push({ kind: 'render', label: id, duration, detail: phase });
  },
  list(): PerfEvent[] { return buffer.slice().reverse(); },
  clear() { buffer = []; listeners.forEach(l => l()); },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

// Perf-Panel: floating Overlay für Admins. Zeigt letzte Route-, Query- und
// Render-Messungen. Toggle via Ctrl+Shift+P oder Button. Nur clientseitig.
import { Profiler, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { perf, type PerfEvent, type PerfKind } from '@/lib/perf';
import { Activity, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

perf.install();

function useEvents(): PerfEvent[] {
  return useSyncExternalStore(perf.subscribe, perf.list, perf.list);
}

function useRouteTiming() {
  const location = useLocation();
  useEffect(() => {
    const t0 = performance.now();
    let raf1 = 0, raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        perf.route(location.pathname, performance.now() - t0);
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [location.pathname]);
}

const kindColor: Record<PerfKind, string> = {
  route: '#7dd3fc',
  query: '#a3e635',
  render: '#f0abfc',
  mark: '#fbbf24',
};

function severity(kind: PerfKind, d: number): string {
  const thresholds: Record<PerfKind, [number, number]> = {
    route: [400, 1200],
    query: [300, 1000],
    render: [16, 50],
    mark: [100, 500],
  };
  const [warn, bad] = thresholds[kind];
  if (d >= bad) return '#f87171';
  if (d >= warn) return '#fbbf24';
  return '#9ca3af';
}

export function PerfPanel() {
  useRouteTiming();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<PerfKind | 'all'>('all');
  const events = useEvents();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shown = useMemo(() => filter === 'all' ? events : events.filter(e => e.kind === filter), [events, filter]);
  const stats = useMemo(() => {
    const byKind: Record<string, { count: number; sum: number; max: number }> = {};
    for (const e of events) {
      const s = byKind[e.kind] ??= { count: 0, sum: 0, max: 0 };
      s.count++; s.sum += e.duration; s.max = Math.max(s.max, e.duration);
    }
    return byKind;
  }, [events]);

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Perf-Panel (Ctrl+Shift+P)"
        className="fixed bottom-3 left-3 z-[60] h-7 w-7 rounded flex items-center justify-center border"
        style={{ background: '#0a0a0a', borderColor: '#222', color: '#888' }}
      >
        <Activity className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="fixed bottom-12 left-3 z-[60] w-[520px] max-w-[calc(100vw-24px)] rounded-md shadow-2xl flex flex-col"
          style={{ background: '#0a0a0a', border: '1px solid #222', maxHeight: '70vh' }}
        >
          <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #1c1c1c' }}>
            <Activity className="h-3.5 w-3.5" style={{ color: '#888' }} />
            <div className="text-[11px] font-medium" style={{ color: '#ddd' }}>Perf</div>
            <div className="flex gap-1 ml-2">
              {(['all', 'route', 'query', 'render', 'mark'] as const).map(k => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn('px-1.5 py-0.5 text-[10px] rounded')}
                  style={{
                    color: filter === k ? '#e0e0e0' : '#666',
                    background: filter === k ? '#181818' : 'transparent',
                  }}
                >{k}</button>
              ))}
            </div>
            <button
              onClick={() => perf.clear()}
              className="ml-auto h-6 w-6 flex items-center justify-center rounded hover:bg-white/5"
              title="Leeren"
            ><Trash2 className="h-3 w-3" style={{ color: '#888' }} /></button>
            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/5"
            ><X className="h-3 w-3" style={{ color: '#888' }} /></button>
          </div>
          <div className="px-3 py-1.5 text-[10px] flex gap-3" style={{ color: '#666', borderBottom: '1px solid #1c1c1c' }}>
            {(['route', 'query', 'render'] as PerfKind[]).map(k => {
              const s = stats[k];
              return (
                <div key={k}>
                  <span style={{ color: kindColor[k] }}>●</span> {k}: {s ? `${s.count} · ø${(s.sum / s.count).toFixed(0)}ms · max ${s.max.toFixed(0)}` : '—'}
                </div>
              );
            })}
          </div>
          <div className="flex-1 overflow-auto font-mono text-[10px]">
            {shown.length === 0 && (
              <div className="p-4 text-center" style={{ color: '#555' }}>Noch keine Messungen. Navigiere oder lade Daten.</div>
            )}
            {shown.map(e => (
              <div key={e.id} className="flex items-center gap-2 px-3 py-1 hover:bg-white/[0.02]" style={{ borderBottom: '1px solid #141414' }}>
                <span style={{ color: kindColor[e.kind], width: 42 }}>{e.kind}</span>
                <span className="flex-1 truncate" style={{ color: '#bbb' }} title={e.label}>{e.label}</span>
                {e.detail && <span style={{ color: '#555' }} className="shrink-0">{e.detail}</span>}
                <span style={{ color: severity(e.kind, e.duration), width: 60, textAlign: 'right' }}>
                  {e.duration.toFixed(0)}ms
                </span>
              </div>
            ))}
          </div>
          <div className="px-3 py-1 text-[9px]" style={{ color: '#444', borderTop: '1px solid #1c1c1c' }}>
            Ring-Buffer 300 · Render zeigt nur Commits &gt; 16ms · Toggle: Ctrl+Shift+P
          </div>
        </div>
      )}
    </>
  );
}

export function PerfProfiler({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Profiler id={id} onRender={(pid, phase, actual) => perf.render(pid, actual, phase)}>
      {children}
    </Profiler>
  );
}

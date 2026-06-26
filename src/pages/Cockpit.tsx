import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Check, Clock, CircleDot, Activity, Layers, Boxes, Cpu, Zap, Truck, Wrench,
  Users, Building2, Briefcase, Settings2, ShieldCheck, Sparkles,
  Database, Network, Brain, Target,
} from 'lucide-react';

type Dept = { id: string; name: string };
type Task = {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
  department_id: string | null;
  assigned_to: string | null;
  created_at: string;
};
type CaseRow = {
  id: string;
  case_no: string | null;
  project_name: string | null;
  status: string;
  created_at: string;
};
type Profile = { id: string; display_name: string | null };

// Neon accent palette — cycled per department, matching reference art
const ACCENTS = [
  { name: 'amber',   hue: '32 100% 58%',  glow: 'rgba(255,160,40,0.55)' },
  { name: 'cyan',    hue: '195 100% 60%', glow: 'rgba(60,200,255,0.55)' },
  { name: 'emerald', hue: '142 80% 52%',  glow: 'rgba(70,230,140,0.55)' },
  { name: 'blue',    hue: '215 100% 62%', glow: 'rgba(80,150,255,0.55)' },
  { name: 'violet',  hue: '270 90% 70%',  glow: 'rgba(170,120,255,0.55)' },
  { name: 'rose',    hue: '340 95% 65%',  glow: 'rgba(255,90,160,0.55)' },
];

const DEPT_ICONS = [Cpu, Boxes, Truck, Wrench, Users, Building2, Briefcase, Settings2, ShieldCheck, Sparkles, Zap, Activity, Layers];
const accentFor = (i: number) => ACCENTS[i % ACCENTS.length];

export default function Cockpit() {
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [deptRes, taskRes, caseRes, profRes] = await Promise.all([
        supabase.from('departments').select('id,name').eq('is_active', true).order('sort_order'),
        supabase
          .from('case_tasks')
          .select('id,case_id,title,description,status,completed,completed_at,sort_order,department_id,assigned_to,created_at')
          .is('archived_at', null),
        supabase
          .from('cases')
          .select('id,case_no,project_name,status,created_at')
          .eq('deleted', false)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase.from('users_profile').select('id,display_name'),
      ]);
      if (cancelled) return;
      setDepartments((deptRes.data as Dept[]) || []);
      setTasks(((taskRes.data as any[]) || []) as Task[]);
      setCases(((caseRes.data as any[]) || []) as CaseRow[]);
      const map: Record<string, Profile> = {};
      ((profRes.data as Profile[]) || []).forEach((p) => (map[p.id] = p));
      setProfiles(map);
      if (!selectedCaseId && caseRes.data && caseRes.data.length) {
        setSelectedCaseId((caseRes.data[0] as any).id);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel('cockpit-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_tasks' }, (payload: any) => {
        setTasks((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== payload.old.id);
          const row = payload.new as Task;
          const idx = prev.findIndex((t) => t.id === row.id);
          if (idx === -1) return [...prev, row];
          const next = [...prev];
          next[idx] = row;
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const deptStats = useMemo(() => {
    const stats: Record<string, { open: number; inProgress: number; done: number }> = {};
    for (const d of departments) stats[d.id] = { open: 0, inProgress: 0, done: 0 };
    for (const t of tasks) {
      if (!t.department_id || !(t.department_id in stats)) continue;
      if (t.status === 'done' || t.completed) { stats[t.department_id].done += 1; continue; }
      stats[t.department_id].open += 1;
      if (t.status === 'in_progress') stats[t.department_id].inProgress += 1;
    }
    return stats;
  }, [tasks, departments]);

  const deptOpenTasks = useMemo(() => {
    if (!selectedDept) return [];
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    return tasks
      .filter((t) => t.department_id === selectedDept && t.status !== 'done' && !t.completed)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 10)
      .map((t) => ({ task: t, case: caseMap.get(t.case_id) }));
  }, [selectedDept, tasks, cases]);

  const selectedCaseTasks = useMemo(() => {
    if (!selectedCaseId) return [];
    return tasks
      .filter((t) => t.case_id === selectedCaseId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at || '').localeCompare(b.created_at || ''));
  }, [tasks, selectedCaseId]);

  const currentIdx = useMemo(() => selectedCaseTasks.findIndex((t) => !t.completed && t.status !== 'done'), [selectedCaseTasks]);

  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? '—' : '—');
  const userName = (id: string | null) => (id ? profiles[id]?.display_name ?? '—' : '—');

  const selectedDeptIdx = selectedDept ? departments.findIndex((d) => d.id === selectedDept) : -1;
  const selectedDeptAccent = selectedDeptIdx >= 0 ? accentFor(selectedDeptIdx) : ACCENTS[1];

  return (
    <AppLayout>
      <div className="cockpit-shell relative min-h-[calc(100vh-1rem)] overflow-hidden">
        <div aria-hidden className="cockpit-grid" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-1" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-2" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-3" />

        <div className="relative p-6 md:p-10 space-y-12 max-w-[1500px] mx-auto">
          {/* HEADER */}
          <header className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[10px] tracking-[0.32em] text-white/55 uppercase">
                <span className="inline-block h-px w-8 bg-white/30" />
                Mission Control
                <span className="cockpit-pulse" />
              </div>
              <h1 className="cockpit-title mt-2">COCKPIT</h1>
              <p className="text-sm text-white/55 max-w-xl mt-2">
                Live-Übersicht über alle Abteilungen und den Vorgangsfluss durch die Organisation.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="cockpit-chip">
                <CircleDot className="h-3 w-3" /> {tasks.filter((t) => t.status !== 'done' && !t.completed).length} aktive Vorgänge
              </div>
              <div className="cockpit-chip cockpit-chip--beta">BETA</div>
            </div>
          </header>

          {/* DEPARTMENTS */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <h2 className="text-[11px] tracking-[0.38em] text-white/55 uppercase">Departments</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            {loading ? (
              <div className="text-sm text-white/50 text-center py-10">// initialisiere Telemetrie …</div>
            ) : (
              <div className="grid gap-x-12 gap-y-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 pl-7">
                {departments.map((d, i) => {
                  const s = deptStats[d.id] ?? { open: 0, inProgress: 0, done: 0 };
                  const active = selectedDept === d.id;
                  const accent = accentFor(i);
                  const Icon = DEPT_ICONS[i % DEPT_ICONS.length];
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDept(active ? null : d.id)}
                      className={cn('cockpit-node group', active && 'cockpit-node--active')}
                      style={{
                        // @ts-ignore
                        '--accent': `hsl(${accent.hue})`,
                        '--accent-glow': accent.glow,
                      } as React.CSSProperties}
                    >
                      <div className="cockpit-node__badge">
                        <Icon className="h-7 w-7" strokeWidth={1.6} />
                      </div>

                      <div className="cockpit-node__index">{String(i + 1).padStart(2, '0')}</div>
                      <div className="cockpit-node__name">{d.name}</div>

                      <div className="cockpit-node__bullets">
                        <div className="cockpit-node__bullet">
                          <span className="cockpit-node__bullet-icon" />
                          <span><span className="cockpit-node__bullet-value">{s.open}</span> offene Vorgänge</span>
                        </div>
                        <div className="cockpit-node__bullet">
                          <span className="cockpit-node__bullet-icon" />
                          <span><span className="cockpit-node__bullet-value">{s.inProgress}</span> in Bearbeitung</span>
                        </div>
                        <div className="cockpit-node__bullet">
                          <span className="cockpit-node__bullet-icon" />
                          <span><span className="cockpit-node__bullet-value">{s.done}</span> erledigt</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedDept && (
              <div
                className="cockpit-panel mt-6"
                style={{
                  // @ts-ignore
                  '--accent': `hsl(${selectedDeptAccent.hue})`,
                  '--accent-glow': selectedDeptAccent.glow,
                } as React.CSSProperties}
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="cockpit-node__bullet-icon" />
                    <div className="text-[11px] tracking-[0.3em] uppercase text-white/55">offene Aufgaben</div>
                    <div className="text-sm text-white/90 font-medium">{deptName(selectedDept)}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.28em] text-white/40">Top 10 · neueste</div>
                </div>
                {deptOpenTasks.length === 0 ? (
                  <div className="text-sm text-white/50 py-8 text-center">Keine offenen Aufgaben.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-white/45 border-b border-white/10">
                          <th className="py-2 pr-3 font-normal">Vorgang</th>
                          <th className="py-2 pr-3 font-normal">Aufgabe</th>
                          <th className="py-2 pr-3 font-normal">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptOpenTasks.map(({ task, case: c }) => (
                          <tr key={task.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                            <td className="py-2.5 pr-3 font-mono text-xs text-white/70">{c?.case_no ?? '—'}</td>
                            <td className="py-2.5 pr-3 truncate max-w-[420px] text-white/85">{task.title}</td>
                            <td className="py-2.5 pr-3">
                              <span className={cn('cockpit-status', task.status === 'in_progress' ? 'cockpit-status--active' : 'cockpit-status--open')}>
                                {task.status === 'in_progress' ? 'in Arbeit' : 'offen'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* LIFECYCLE PIPELINE */}
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
              <h2 className="text-[11px] tracking-[0.38em] text-white/55 uppercase">Vorgangs-Pipeline</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-white/55 tracking-wide">
                EINE LINIE · EIN ZIEL — Nahtlos vernetzte Prozesse von Sales bis Lieferung.
              </div>
              <div className="w-[380px] max-w-full">
                <Select value={selectedCaseId ?? undefined} onValueChange={(v) => { setSelectedCaseId(v); setSelectedNodeId(null); }}>
                  <SelectTrigger className="cockpit-select">
                    <SelectValue placeholder="Vorgang wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-mono text-xs mr-2">{c.case_no ?? '—'}</span>
                        <span className="truncate">{c.project_name ?? '—'}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="cockpit-panel">
              {selectedCaseTasks.length === 0 ? (
                <div className="text-sm text-white/50 py-10 text-center">Keine Aufgaben für diesen Vorgang.</div>
              ) : (
                <>
                  <div className="overflow-x-auto pb-4">
                    <ol className="cockpit-pipeline">
                      {selectedCaseTasks.map((t, i) => {
                        const done = t.completed || t.status === 'done';
                        const current = !done && i === currentIdx;
                        const upcoming = !done && !current;
                        const active = selectedNodeId === t.id;
                        // Color gradient: progresses from cyan (start) through to emerald (end)
                        const progress = selectedCaseTasks.length > 1 ? i / (selectedCaseTasks.length - 1) : 0;
                        const hue = 200 - progress * 60; // 200 (cyan) -> 140 (emerald)
                        const accentHsl = `${hue} 90% 58%`;
                        const accentGlow = `hsla(${hue}, 90%, 58%, 0.55)`;
                        const nextHue = 200 - ((i + 1) / Math.max(1, selectedCaseTasks.length - 1)) * 60;
                        return (
                          <li key={t.id} className="flex items-start">
                            <button
                              type="button"
                              onClick={() => setSelectedNodeId(active ? null : t.id)}
                              className={cn('cockpit-step', active && 'cockpit-step--active', upcoming && 'cockpit-step--upcoming')}
                              style={{
                                // @ts-ignore
                                '--accent': `hsl(${accentHsl})`,
                                '--accent-glow': accentGlow,
                              } as React.CSSProperties}
                            >
                              <div className="cockpit-step__hex">
                                {done ? <Check className="h-6 w-6" strokeWidth={2.2} /> : current ? <Clock className="h-5 w-5" /> : <span className="text-[11px] font-mono">{String(i + 1).padStart(2, '0')}</span>}
                              </div>
                              <div className="cockpit-step__label">
                                <div className="cockpit-step__label-status">
                                  {done ? 'erledigt' : current ? 'aktuell' : 'ausstehend'}
                                </div>
                                <div className="cockpit-step__label-title">{t.title}</div>
                                <div className="cockpit-step__label-dept">{deptName(t.department_id)}</div>
                              </div>
                            </button>
                            {i < selectedCaseTasks.length - 1 && (
                              <div
                                className={cn('cockpit-connector', (done || selectedCaseTasks[i + 1].completed || selectedCaseTasks[i + 1].status === 'done') && 'cockpit-connector--lit')}
                                style={{
                                  // @ts-ignore
                                  '--from': `hsl(${accentHsl})`,
                                  '--to': `hsl(${nextHue} 90% 58%)`,
                                } as React.CSSProperties}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>

                  {selectedNodeId && (() => {
                    const t = selectedCaseTasks.find((x) => x.id === selectedNodeId);
                    if (!t) return null;
                    const done = t.completed || t.status === 'done';
                    return (
                      <div className="mt-4 cockpit-subpanel">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Abteilung" value={deptName(t.department_id)} />
                          <Field label="Zugewiesen" value={userName(t.assigned_to)} />
                          <Field label="Status" value={done ? 'erledigt' : t.status === 'in_progress' ? 'in Arbeit' : 'offen'} />
                          <Field label="Abgeschlossen am" value={t.completed_at ? new Date(t.completed_at).toLocaleString('de-DE') : t.status === 'in_progress' ? 'in Arbeit' : 'noch nicht gestartet'} />
                          <div className="sm:col-span-2">
                            <div className="cockpit-field__label">Beschreibung</div>
                            <div className="whitespace-pre-wrap text-sm text-white/80">{t.description || '—'}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </section>

          {/* FEATURE BAR */}
          <div className="cockpit-featurebar">
            <div className="cockpit-featurebar__item"><Database className="h-3.5 w-3.5" /> Echtzeit-Daten</div>
            <div className="cockpit-featurebar__item"><Network className="h-3.5 w-3.5" /> Vernetzte Systeme</div>
            <div className="cockpit-featurebar__item"><Brain className="h-3.5 w-3.5" /> Intelligente Prozesse</div>
            <div className="cockpit-featurebar__item"><Target className="h-3.5 w-3.5" /> Gemeinsamer Erfolg</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="cockpit-field__label">{label}</div>
      <div className="text-sm text-white/85">{value}</div>
    </div>
  );
}

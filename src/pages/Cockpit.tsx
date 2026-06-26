import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Check, Clock, CircleDot, Activity, Layers, Boxes, Cpu, Zap, Truck, Wrench, Users, Building2, Briefcase, Settings2, ShieldCheck, Sparkles } from 'lucide-react';

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

// Neon accent palette — cycled per department, matching the reference art (orange, cyan, green, violet, amber)
const ACCENTS = [
  { name: 'amber',   hue: '32 100% 58%',  glow: 'rgba(255,160,40,0.55)' },
  { name: 'cyan',    hue: '190 100% 60%', glow: 'rgba(60,200,255,0.55)' },
  { name: 'emerald', hue: '152 90% 55%',  glow: 'rgba(60,255,170,0.55)' },
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

  // Realtime
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
  const selectedDeptAccent = selectedDeptIdx >= 0 ? accentFor(selectedDeptIdx) : ACCENTS[0];

  return (
    <AppLayout>
      <div className="cockpit-shell relative min-h-[calc(100vh-1rem)] overflow-hidden">
        {/* ambient backdrop */}
        <div aria-hidden className="cockpit-grid" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-1" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-2" />
        <div aria-hidden className="cockpit-aurora cockpit-aurora-3" />

        <div className="relative p-6 md:p-8 space-y-10 max-w-[1500px] mx-auto">
          <header className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] text-white/50 uppercase">
                <span className="inline-block h-px w-8 bg-white/30" />
                Mission Control
                <span className="cockpit-pulse" />
              </div>
              <h1 className="cockpit-title">COCKPIT</h1>
              <p className="text-sm text-white/55 max-w-xl mt-1">
                Live-Übersicht über alle Abteilungen und den Vorgangsfluss durch die Organisation. Read-only Telemetrie.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="cockpit-chip">
                <CircleDot className="h-3 w-3" /> {tasks.filter((t) => t.status !== 'done' && !t.completed).length} aktive Vorgänge
              </div>
              <div className="cockpit-chip cockpit-chip--beta">BETA</div>
            </div>
          </header>

          {/* DEPARTMENTS — hex grid */}
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-[11px] tracking-[0.35em] text-white/60 uppercase">Departments / Knotenpunkte</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>

            {loading ? (
              <div className="text-sm text-white/50 text-center py-10">// initialisiere Telemetrie …</div>
            ) : (
              <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                        // @ts-ignore custom props
                        '--accent': `hsl(${accent.hue})`,
                        '--accent-glow': accent.glow,
                      } as React.CSSProperties}
                    >
                      <span className="cockpit-node__corner cockpit-node__corner--tl" />
                      <span className="cockpit-node__corner cockpit-node__corner--tr" />
                      <span className="cockpit-node__corner cockpit-node__corner--bl" />
                      <span className="cockpit-node__corner cockpit-node__corner--br" />

                      <div className="flex items-start justify-between">
                        <div className="cockpit-node__index">{String(i + 1).padStart(2, '0')}</div>
                        <div className="cockpit-node__icon">
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="mt-3 text-[10px] tracking-[0.25em] uppercase text-white/45">Knoten</div>
                      <div className="cockpit-node__name">{d.name}</div>

                      <div className="mt-4 flex items-end justify-between">
                        <div>
                          <div className="cockpit-node__metric">{s.open}</div>
                          <div className="text-[9px] uppercase tracking-widest text-white/45">offen</div>
                        </div>
                        <div className="text-right space-y-1">
                          <div className="cockpit-node__pill">
                            <span className="cockpit-dot" /> {s.inProgress} aktiv
                          </div>
                          <div className="text-[9px] text-white/35 tracking-wider">{s.done} erledigt</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {selectedDept && (
              <div
                className="cockpit-panel mt-4"
                style={{
                  // @ts-ignore
                  '--accent': `hsl(${selectedDeptAccent.hue})`,
                  '--accent-glow': selectedDeptAccent.glow,
                } as React.CSSProperties}
              >
                <span className="cockpit-node__corner cockpit-node__corner--tl" />
                <span className="cockpit-node__corner cockpit-node__corner--tr" />
                <span className="cockpit-node__corner cockpit-node__corner--bl" />
                <span className="cockpit-node__corner cockpit-node__corner--br" />
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="cockpit-dot" />
                    <div className="text-[11px] tracking-[0.3em] uppercase text-white/55">offene Aufgaben</div>
                    <div className="text-sm text-white/90">{deptName(selectedDept)}</div>
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-white/40">Top 10 · neueste</div>
                </div>
                {deptOpenTasks.length === 0 ? (
                  <div className="text-sm text-white/50 py-8 text-center">Keine offenen Aufgaben.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-widest text-white/45 border-b border-white/10">
                          <th className="py-2 pr-3 font-normal">Vorgang</th>
                          <th className="py-2 pr-3 font-normal">Aufgabe</th>
                          <th className="py-2 pr-3 font-normal">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deptOpenTasks.map(({ task, case: c }) => (
                          <tr key={task.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                            <td className="py-2 pr-3 font-mono text-xs text-white/70">{c?.case_no ?? '—'}</td>
                            <td className="py-2 pr-3 truncate max-w-[420px] text-white/85">{task.title}</td>
                            <td className="py-2 pr-3">
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

          {/* LIFECYCLE — process flow */}
          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <h2 className="text-[11px] tracking-[0.35em] text-white/60 uppercase">Vorgangs-Flow / Lifecycle</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-xs text-white/50">
                Wähle einen Vorgang, um den vollständigen Kettenfluss zu sehen.
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
              <span className="cockpit-node__corner cockpit-node__corner--tl" />
              <span className="cockpit-node__corner cockpit-node__corner--tr" />
              <span className="cockpit-node__corner cockpit-node__corner--bl" />
              <span className="cockpit-node__corner cockpit-node__corner--br" />

              {selectedCaseTasks.length === 0 ? (
                <div className="text-sm text-white/50 py-10 text-center">Keine Aufgaben für diesen Vorgang.</div>
              ) : (
                <>
                  <div className="overflow-x-auto pb-3">
                    <ol className="flex items-stretch gap-0 min-w-max px-1 pt-2">
                      {selectedCaseTasks.map((t, i) => {
                        const done = t.completed || t.status === 'done';
                        const current = !done && i === currentIdx;
                        const upcoming = !done && !current;
                        const active = selectedNodeId === t.id;
                        const accent = done
                          ? ACCENTS[2] /* emerald for done */
                          : current
                          ? ACCENTS[0] /* amber for current */
                          : { name: 'mute', hue: '220 10% 55%', glow: 'rgba(150,160,180,0.25)' };
                        return (
                          <li key={t.id} className="flex items-center">
                            <button
                              type="button"
                              onClick={() => setSelectedNodeId(active ? null : t.id)}
                              className={cn('cockpit-step', active && 'cockpit-step--active', upcoming && 'cockpit-step--upcoming')}
                              style={{
                                // @ts-ignore
                                '--accent': `hsl(${accent.hue})`,
                                '--accent-glow': accent.glow,
                              } as React.CSSProperties}
                            >
                              <div className="cockpit-step__hex">
                                {done ? <Check className="h-5 w-5" /> : current ? <Clock className="h-5 w-5" /> : <span className="text-[11px] font-mono">{String(i + 1).padStart(2, '0')}</span>}
                              </div>
                              <div className="cockpit-step__label">
                                <div className="text-[9px] uppercase tracking-[0.25em] text-white/45">
                                  {done ? 'erledigt' : current ? 'aktuell' : 'ausstehend'}
                                </div>
                                <div className="text-xs font-medium text-white/90 truncate max-w-[160px]">{t.title}</div>
                                <div className="text-[10px] text-white/45 truncate max-w-[160px]">{deptName(t.department_id)}</div>
                              </div>
                            </button>
                            {i < selectedCaseTasks.length - 1 && (
                              <div className={cn('cockpit-connector', (selectedCaseTasks[i + 1].completed || selectedCaseTasks[i + 1].status === 'done' || done) && 'cockpit-connector--lit')} />
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

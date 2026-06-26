import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Check, Circle, Clock } from 'lucide-react';

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

const OPEN_STATUSES = ['open', 'in_progress'] as const;

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
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: keep tasks fresh
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
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const deptStats = useMemo(() => {
    const stats: Record<string, { open: number; inProgress: number }> = {};
    for (const d of departments) stats[d.id] = { open: 0, inProgress: 0 };
    for (const t of tasks) {
      if (!t.department_id || !(t.department_id in stats)) continue;
      if (t.status === 'done' || t.completed) continue;
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

  const currentIdx = useMemo(() => {
    const i = selectedCaseTasks.findIndex((t) => !t.completed && t.status !== 'done');
    return i;
  }, [selectedCaseTasks]);

  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name ?? '—' : '—');
  const userName = (id: string | null) => (id ? profiles[id]?.display_name ?? '—' : '—');

  return (
    <AppLayout>
      <div className="p-6 space-y-8 max-w-[1400px]">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cockpit</h1>
            <p className="text-sm text-muted-foreground">
              Read-only Übersicht über Abteilungen und Vorgangsverlauf.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">Beta</Badge>
        </header>

        {/* Departments */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Abteilungen</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Lade…</div>
          ) : (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {departments.map((d) => {
                const s = deptStats[d.id] ?? { open: 0, inProgress: 0 };
                const active = selectedDept === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedDept(active ? null : d.id)}
                    className={cn(
                      'text-left rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus:outline-none',
                      active ? 'border-primary border-2' : 'border-border',
                    )}
                  >
                    <div className="text-xs text-muted-foreground truncate">Abteilung</div>
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className="text-2xl font-semibold tabular-nums">{s.open}</div>
                        <div className="text-[10px] text-muted-foreground">offen</div>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">
                        {s.inProgress} in Arbeit
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selectedDept && (
            <Card className="p-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Offene Aufgaben · {deptName(selectedDept)}</div>
                <div className="text-[11px] text-muted-foreground">Top 10 neueste</div>
              </div>
              {deptOpenTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Keine offenen Aufgaben.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-3 font-medium">Vorgang</th>
                        <th className="py-2 pr-3 font-medium">Aufgabe</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deptOpenTasks.map(({ task, case: c }) => (
                        <tr key={task.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">{c?.case_no ?? '—'}</td>
                          <td className="py-2 pr-3 truncate max-w-[420px]">{task.title}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={task.status === 'in_progress' ? 'default' : 'outline'} className="text-[10px]">
                              {task.status === 'in_progress' ? 'in Arbeit' : 'offen'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </section>

        {/* Lifecycle timeline */}
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Vorgangsverlauf</h2>
            <div className="w-[360px] max-w-full">
              <Select value={selectedCaseId ?? undefined} onValueChange={(v) => { setSelectedCaseId(v); setSelectedNodeId(null); }}>
                <SelectTrigger>
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

          <Card className="p-4">
            {selectedCaseTasks.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Keine Aufgaben für diesen Vorgang.</div>
            ) : (
              <>
                <div className="overflow-x-auto pb-2">
                  <ol className="flex items-stretch gap-2 min-w-max">
                    {selectedCaseTasks.map((t, i) => {
                      const done = t.completed || t.status === 'done';
                      const current = !done && i === currentIdx;
                      const upcoming = !done && !current;
                      const active = selectedNodeId === t.id;
                      return (
                        <li key={t.id} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedNodeId(active ? null : t.id)}
                            className={cn(
                              'rounded-md border px-3 py-2 text-left min-w-[180px] transition-colors hover:bg-accent/40',
                              active && 'border-primary border-2',
                              !active && done && 'border-border bg-muted/40',
                              !active && current && 'border-foreground/40',
                              !active && upcoming && 'border-dashed border-border',
                            )}
                          >
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {done ? <Check className="h-3 w-3" /> : current ? <Clock className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                              <span>{done ? 'erledigt' : current ? 'aktuell' : 'ausstehend'}</span>
                            </div>
                            <div className="text-xs font-medium mt-1 truncate max-w-[200px]">{t.title}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{deptName(t.department_id)}</div>
                          </button>
                          {i < selectedCaseTasks.length - 1 && (
                            <span className="h-px w-4 bg-border" aria-hidden />
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
                    <div className="mt-4 rounded-md border bg-muted/30 p-4 text-sm">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">Abteilung</div>
                          <div>{deptName(t.department_id)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">Zugewiesen</div>
                          <div>{userName(t.assigned_to)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">Status</div>
                          <div>
                            {done ? 'erledigt' : t.status === 'in_progress' ? 'in Arbeit' : 'offen'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground">Abgeschlossen am</div>
                          <div>
                            {t.completed_at
                              ? new Date(t.completed_at).toLocaleString('de-DE')
                              : t.status === 'in_progress'
                              ? 'in Arbeit'
                              : 'noch nicht gestartet'}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-[10px] uppercase text-muted-foreground">Beschreibung</div>
                          <div className="whitespace-pre-wrap text-sm">{t.description || '—'}</div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}

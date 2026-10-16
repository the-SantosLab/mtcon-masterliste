import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/AppLayout';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { requestPercent, departmentSteps } from '@/lib/requestProgress';

const db = supabase as any;
const CLOSED = ['abgeschlossen', 'verworfen', 'archiv'];

/** Kundenanfragen als getrennte Container je Kategorie mit Fortschritt und Schritten pro Abteilung. */
export default function RequestContainers() {
  const [cases, setCases] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [depts, setDepts] = useState<Map<string, string>>(new Map());
  const [areas, setAreas] = useState<Map<string, string>>(new Map());
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, d, a] = await Promise.all([
        db.from('cases').select('id, case_no, project_name, client_name, customer_no, status, department_id, internal_area_code, due_at')
          .eq('deleted', false).not('status', 'in', `(${CLOSED.join(',')})`).or('client_name.not.is.null,customer_no.not.is.null')
          .order('created_at', { ascending: false }).limit(500),
        db.from('departments').select('id, name'),
        db.from('internal_areas').select('code, name'),
      ]);
      const list = c.data ?? [];
      setCases(list);
      setDepts(new Map((d.data ?? []).map((x: any) => [x.id, x.name])));
      setAreas(new Map((a.data ?? []).map((x: any) => [x.code, x.name])));
      const ids = list.map((x: any) => x.id);
      const t = ids.length ? await db.from('case_tasks').select('case_id, department_id, status, completed, sort_order').in('case_id', ids).is('archived_at', null).order('sort_order').limit(10000) : { data: [] };
      setTasks(t.data ?? []);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const m = new Map<string, any[]>();
    for (const c of cases) {
      if (needle && ![c.case_no, c.project_name, c.client_name, c.customer_no].some((v) => String(v ?? '').toLowerCase().includes(needle))) continue;
      const cat = (c.internal_area_code && areas.get(c.internal_area_code)) || depts.get(c.department_id) || 'Ohne Kategorie';
      m.set(cat, [...(m.get(cat) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [cases, areas, depts, q]);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-2xl font-medium">Anfragen</h1>
            <p className="mt-1 text-xs text-muted-foreground">Offene Kundenanfragen je Kategorie · Fortschritt aus erledigten Aufgaben · Schritte je Abteilung</p></div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…" className="w-64" />
        </div>
        {loading && <p className="text-xs text-muted-foreground">Lade…</p>}
        {!loading && !groups.length && <p className="text-xs text-muted-foreground">Keine offenen Kundenanfragen.</p>}
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map(([cat, list]) => (
            <section key={cat} className="rounded-xl border border-border bg-card/60">
              <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <h2 className="text-sm font-medium">{cat}</h2><span className="text-xs tabular-nums text-muted-foreground">{list.length}</span>
              </header>
              <div className="max-h-[520px] divide-y divide-border overflow-y-auto">
                {list.map((c) => {
                  const ct = tasks.filter((t) => t.case_id === c.id);
                  const pct = requestPercent(ct);
                  const steps = departmentSteps(ct);
                  return (
                    <Link key={c.id} to={`/cases/${c.id}`} className="block px-4 py-3 hover:bg-muted/40">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm">{c.project_name}</p>
                        <span className="shrink-0 text-xs font-medium tabular-nums">{pct} %</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{c.case_no} · {c.client_name ?? c.customer_no}{c.due_at ? ` · fällig ${new Date(c.due_at).toLocaleDateString('de-DE')}` : ''}</p>
                      <Progress value={pct} className="mt-2 h-1.5" />
                      {steps.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{steps.map((s) => (
                        <span key={s.department_id} className={cn('rounded border px-1.5 py-0.5 text-[10px]',
                          s.state === 'done' ? 'border-primary/40 bg-primary/10 text-primary' : s.state === 'active' ? 'border-border bg-muted text-foreground' : 'border-border text-muted-foreground')}>
                          {depts.get(s.department_id) ?? 'Abteilung'} {s.done}/{s.total}</span>))}</div>}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

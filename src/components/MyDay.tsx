import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, CalendarCheck, RefreshCw, AlertCircle, ArrowRightLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCrmAccess } from '@/hooks/useCrmAccess';
import { useErpAccess } from '@/hooks/useErpAccess';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { dayOf, dueToday, localDay, personalHandoff, sortDayItems, type DayItem } from '@/lib/myDay';

async function paged<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}

export function MyDay() {
  const { user, profile, isAdmin, isStaff } = useAuth();
  const crm = useCrmAccess();
  const erp = useErpAccess();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(8);
  const today = localDay(now);
  const writer = isAdmin || isStaff;
  const query = useQuery({
    queryKey: ['my-day', user?.id, today, crm.allowed, erp.allowed, profile?.department_id, profile?.active, writer],
    enabled: Boolean(user) && !crm.loading && !erp.loading,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return { items: [] as DayItem[], failures: [] as string[] };
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
      const items: DayItem[] = [];
      const jobs: { name: string; run: () => Promise<void> }[] = [
        { name: 'Vorgangsaufgaben', run: async () => {
          const rows = await paged((f, t) => supabase.from('case_tasks')
            .select('id,title,due_at,created_at,case_id,cases!inner(case_no,project_name,deleted,status)')
            .eq('assigned_to', user.id).eq('completed', false).is('archived_at', null).neq('status', 'done')
            .eq('cases.deleted', false).not('cases.status', 'in', '(abgeschlossen,verworfen,archiv)')
            .lt('due_at', end).order('id').range(f, t));
          for (const r of rows) if (dueToday(r.due_at, now)) items.push({ id: `case:${r.id}`, title: r.title,
            context: `${r.cases.case_no} · ${r.cases.project_name}`, href: `/cases/${r.case_id}`,
            source: 'case', due: r.due_at, opened: r.created_at });
        } },
      ];
      if (crm.allowed) jobs.push({ name: 'CRM', run: async () => {
        const rows = await paged((f, t) => supabase.from('crm_activities').select('id,subject,type,due_at,created_at')
          .eq('owner_id', user.id).is('completed_at', null).lt('due_at', end).order('id').range(f, t));
        for (const r of rows) if (dueToday(r.due_at, now)) items.push({ id: `crm:${r.id}`, title: r.subject,
          context: 'CRM · Kommunikation & Aufgaben', href: `/crm/kommunikation/aufgaben?activity=${r.id}`,
          source: 'crm', due: r.due_at, opened: r.created_at });
      } });
      if (erp.allowed && writer && profile?.active) {
        jobs.push({ name: 'ERP-Aufträge', run: async () => {
          const rows = await paged((f, t) => supabase.from('orders').select('id,order_no,customer_name,delivery_date,created_at')
            .eq('assigned_to', user.id).not('status', 'in', '(completed,cancelled)')
            .lte('delivery_date', today).order('id').range(f, t));
          for (const r of rows) items.push({ id: `erp:${r.id}`, title: `Liefertermin prüfen · ${r.order_no}`,
            context: r.customer_name || 'Kundenauftrag', href: `/orders/${r.id}/akte`, source: 'erp', due: r.delivery_date, opened: r.created_at });
        } });
        jobs.push({ name: 'Übergaben', run: async () => {
          const members = await paged((f, t) => supabase.from('department_members').select('department_id').eq('user_id', user.id).order('id').range(f, t));
          const departments = [...new Set([profile.department_id, ...members.map(m => m.department_id)].filter((x): x is string => Boolean(x)))];
          if (!departments.length) return;
          const rows = await paged((f, t) => supabase.from('order_handoffs')
            .select('id,title,status,department_id,order_id,created_at,orders!inner(order_no,customer_name,status),departments(name)')
            .eq('status', 'open').in('department_id', departments).not('orders.status', 'in', '(completed,cancelled)').order('id').range(f, t));
          for (const r of rows) if (personalHandoff(r.status, r.department_id, departments, profile.active, writer))
            items.push({ id: `handoff:${r.id}`, title: r.title, context: `${r.orders.order_no} · ${r.departments?.name || 'Bereich'} · ${r.orders.customer_name || ''}`,
              href: `/orders/${r.order_id}/akte`, source: 'handoff', due: null, opened: r.created_at });
        } });
      }
      const results = await Promise.allSettled(jobs.map(j => j.run()));
      return { items: sortDayItems(items, now), failures: results.flatMap((r, i) => r.status === 'rejected' ? [jobs[i].name] : []) };
    },
  });
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(new Date()); void query.refetch(); }, 60_000);
    const ch = supabase.channel(`my-day-${user?.id}`);
    for (const table of ['crm_activities', 'case_tasks', 'orders', 'order_handoffs', 'department_members'])
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void query.refetch(); });
    ch.subscribe();
    return () => { clearInterval(timer); void supabase.removeChannel(ch); };
  }, [user?.id, today, crm.allowed, erp.allowed, writer]);

  const items = query.data?.items || [];
  const overdue = items.filter(i => i.due && dayOf(i.due) < today);
  const due = items.filter(i => i.due && dayOf(i.due) === today);
  const handoffs = items.filter(i => i.source === 'handoff');
  const filtered = filter === 'late' ? overdue : filter === 'today' ? due : filter === 'handoff' ? handoffs : items;
  const busy = query.isPending || crm.loading || erp.loading;
  return <section aria-label="Mein Tag" className="border-b border-border pb-5">
    <div className="flex items-center justify-between gap-3 mb-4">
      <div><h2 className="text-lg font-medium flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-primary" />Mein Tag</h2>
        <p className="text-xs text-muted-foreground mt-1">{now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      <Button size="icon" variant="ghost" aria-label="Mein Tag aktualisieren" title="Aktualisieren" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
    </div>
    <div className="grid grid-cols-3 divide-x divide-border border-y border-border mb-4">
      {[{ label: 'Überfällig', value: overdue.length, tone: 'text-destructive' }, { label: 'Heute fällig', value: due.length, tone: 'text-foreground' }, { label: 'Offene Übergaben', value: handoffs.length, tone: 'text-primary' }].map(m => <div key={m.label} className="py-3 px-3 first:pl-0"><p className={cn('text-2xl font-medium tabular-nums', m.tone)}>{busy ? '–' : m.value}</p><p className="text-xs text-muted-foreground mt-1">{m.label}</p></div>)}
    </div>
    <Tabs value={filter} onValueChange={v => { setFilter(v); setLimit(8); }}><TabsList><TabsTrigger value="all">Alle</TabsTrigger><TabsTrigger value="late">Überfällig</TabsTrigger><TabsTrigger value="today">Heute</TabsTrigger><TabsTrigger value="handoff">Übergaben</TabsTrigger></TabsList></Tabs>
    {!!query.data?.failures.length && <div role="alert" className="flex gap-2 items-center text-xs text-destructive mt-3"><AlertCircle className="h-4 w-4 shrink-0" />Nicht geladen: {query.data.failures.join(', ')}<Button variant="ghost" size="sm" onClick={() => void query.refetch()}>Erneut laden</Button></div>}
    {busy ? <p className="py-6 text-sm text-muted-foreground">Aufgaben werden geladen…</p> : filtered.length === 0 ? <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />Keine {filter === 'handoff' ? 'offenen Übergaben' : 'fälligen Aufgaben'}.</div> : <ul className="divide-y divide-border mt-3">
      {filtered.slice(0, limit).map(i => <li key={i.id}><Button asChild variant="ghost" className="h-auto min-h-16 w-full rounded-none justify-start px-2 py-3 whitespace-normal"><Link to={i.href} aria-label={`${i.title} öffnen`}>
        {i.source === 'handoff' ? <ArrowRightLeft className="h-4 w-4 text-primary shrink-0" /> : <CalendarCheck className="h-4 w-4 text-muted-foreground shrink-0" />}
        <div className="min-w-0 flex-1 text-left"><p className="text-sm font-medium break-words">{i.title}</p><p className="text-xs text-muted-foreground mt-1 break-words">{i.context}</p></div>
        <span className={cn('text-xs shrink-0 tabular-nums', i.due && dayOf(i.due) < today ? 'text-destructive' : 'text-muted-foreground')}>{i.due ? new Date(`${dayOf(i.due)}T12:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : 'Offen'}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link></Button></li>)}
    </ul>}
    {filtered.length > limit && <Button variant="ghost" size="sm" className="mt-2" onClick={() => setLimit(n => n + 8)}>Weitere anzeigen ({filtered.length - limit})</Button>}
  </section>;
}
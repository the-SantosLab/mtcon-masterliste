import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity as ActivityIcon, Plus, Loader2, AlertCircle, RefreshCw, ArrowUpRight, Check,
  ClipboardList, CalendarClock, Calendar, Phone, Mail, FileText, CheckCircle2,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  activityPages, filterForPage, groupByType, isDueSoon, isOverdue, overviewStats, typeLabel,
  DUE_SOON_DAYS, type Activity, type ActivityPageKey, type VisitReport,
} from '@/lib/activityPages';
import { cn } from '@/lib/utils';

const icons = { tasks: ClipboardList, followups: CalendarClock, meetings: Calendar, calls: Phone, emails: Mail, visits: FileText, done: CheckCircle2 };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const DAY = 86_400_000;

async function paged<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

export default function ActivityWorkspace({ page: key }: { page?: ActivityPageKey }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = activityPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-activity-workspace', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [activities, contacts, companies, deals, staff, visits] = await Promise.all([
        paged<Activity>((f, t) => supabase.from('crm_activities').select('*').order('id').range(f, t)),
        paged<{ id: string; first_name: string; last_name: string }>((f, t) => supabase.from('contacts').select('id, first_name, last_name').order('id').range(f, t)),
        paged<{ id: string; name: string }>((f, t) => supabase.from('companies').select('id, name').order('id').range(f, t)),
        paged<{ id: string; title: string }>((f, t) => supabase.from('deals').select('id, title').order('id').range(f, t)),
        paged<{ id: string; display_name: string | null; short_code: string | null }>((f, t) => supabase.from('users_profile').select('id, display_name, short_code').order('id').range(f, t)),
        paged<VisitReport>((f, t) => supabase.from('crm_visit_reports').select('*').order('visit_date', { ascending: false }).range(f, t)),
      ]);
      return { activities, contacts, companies, deals, staff, visits };
    },
  });

  const d = query.data;
  const acts = useMemo(() => d?.activities ?? [], [d]);
  const names = useMemo(() => ({
    contact: new Map((d?.contacts ?? []).map(c => [c.id, `${c.first_name} ${c.last_name}`.trim()])),
    company: new Map((d?.companies ?? []).map(c => [c.id, c.name])),
    deal: new Map((d?.deals ?? []).map(x => [x.id, x.title])),
    staff: new Map((d?.staff ?? []).map(s => [s.id, s.display_name || s.short_code || 'Unbekannt'])),
  }), [d]);

  const refOf = (a: Activity) =>
    (a.contact_id && names.contact.get(a.contact_id))
    ?? (a.company_id && names.company.get(a.company_id))
    ?? (a.deal_id && names.deal.get(a.deal_id))
    ?? null;

  const rows = useMemo(() => filterForPage(key ?? null, acts)
    .filter(a => `${a.subject} ${a.body ?? ''} ${refOf(a) ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  [acts, key, search, names]);

  const complete = async (a: Activity) => {
    if (!user) return;
    setBusy(a.id);
    const { error } = await supabase.from('crm_activities')
      .update({ completed_at: new Date().toISOString(), completed_by: user.id }).eq('id', a.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Aktivität erledigt');
    await qc.invalidateQueries({ queryKey: ['crm-activity-workspace', user.id] });
  };

  const takeOver = async (a: Activity) => {
    if (!user) return;
    setBusy(a.id);
    const { error } = await supabase.from('crm_activities').update({ owner_id: user.id }).eq('id', a.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Dir zugewiesen');
    await qc.invalidateQueries({ queryKey: ['crm-activity-workspace', user.id] });
  };

  const stateOf = (a: Activity) => {
    if (a.completed_at) return <span className="text-status-done">Erledigt {fmt(a.completed_at)}</span>;
    if (isOverdue(a)) return <span className="text-status-overdue">Überfällig seit {fmt(a.due_at)}</span>;
    if (isDueSoon(a)) return <span className="text-status-working">Fällig {fmt(a.due_at)}</span>;
    return <span className="text-muted-foreground">{a.due_at ? `Fällig ${fmt(a.due_at)}` : 'Ohne Frist'}</span>;
  };

  const stats = useMemo(() => overviewStats(acts), [acts]);

  const open = (label: string, n: number, to: string) => <Link key={label} to={to} className="flex justify-between items-center py-3.5 text-xs hover:text-primary"><span>{label}</span><span className="flex gap-3 items-center"><span className="tabular-nums text-lg font-medium">{n}</span><ArrowUpRight className="h-3.5 w-3.5" /></span></Link>;

  const table = (list = rows) => list.length === 0
    ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Einträge in diesem Bereich.</p>
    : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Betreff</th><th className="font-normal">Bezug</th><th className="font-normal">Zuständig</th><th className="font-normal">Status</th><th /></tr></thead>
      <tbody>{list.slice(0, 300).map(a => <tr key={a.id} className="border-b border-border/60">
        <td className="py-2.5 font-medium">{a.subject}<div className="text-muted-foreground font-normal">{typeLabel[a.type] ?? a.type}{a.auto_generated ? ' · automatisch' : ''}</div></td>
        <td className="text-muted-foreground">{refOf(a) ?? '–'}</td>
        <td className="text-muted-foreground">{a.owner_id ? names.staff.get(a.owner_id) ?? 'Unbekannt' : <span className="text-status-overdue">Niemand</span>}</td>
        <td>{stateOf(a)}</td>
        <td className="text-right whitespace-nowrap">
          {!a.owner_id && <Button size="sm" variant="outline" className="mr-1" disabled={busy === a.id} onClick={() => void takeOver(a)}>Übernehmen</Button>}
          {!a.completed_at && <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => void complete(a)}>
            {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="h-3.5 w-3.5 mr-1" />Erledigen</>}
          </Button>}
        </td>
      </tr>)}</tbody></table>
      {list.length > 300 && <p className="text-xs text-muted-foreground py-3">300 von {list.length} angezeigt – Suche verfeinern.</p>}</div>;

  const content = () => {
    if (!d) return null;
    if (key === 'visits') {
      const visits = d.visits.filter(v => `${v.purpose ?? ''} ${v.result ?? ''} ${v.participants ?? ''} ${names.company.get(v.company_id ?? '') ?? ''}`.toLowerCase().includes(search.toLowerCase()));
      return visits.length === 0
        ? <p className="text-xs text-muted-foreground py-8 text-center">Noch keine Besuchsberichte erfasst.</p>
        : <div className="divide-y divide-border">{visits.slice(0, 100).map(v => <div key={v.id} className="py-4">
          <div className="flex justify-between gap-3 text-sm"><span className="font-medium">{v.purpose ?? 'Besuch'}</span><span className="text-xs text-muted-foreground tabular-nums">{fmt(v.visit_date)}</span></div>
          <div className="text-xs text-muted-foreground mt-1">{names.company.get(v.company_id ?? '') ?? '–'}{v.participants ? ` · ${v.participants}` : ''}</div>
          {v.result && <p className="text-xs mt-2">{v.result}</p>}
          {v.next_steps && <p className="text-xs mt-1 text-status-working">Nächste Schritte: {v.next_steps}</p>}
        </div>)}</div>;
    }
    return table();
  };

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><ActivityIcon className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Kommunikation & Aufgaben</div><h1 className="text-xl font-medium">{page?.title ?? 'Kommunikation & Aufgaben'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/activities"><ArrowUpRight className="h-4 w-4 mr-1.5" />Vollständige Liste</Link></Button>
        <Button asChild size="sm"><Link to="/crm/activities?action=new&type=task"><Plus className="h-4 w-4 mr-1.5" />Aufgabe anlegen</Link></Button>
      </div>
    </header>
    <nav aria-label="Kommunikationsseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/kommunikation' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/kommunikation"><ActivityIcon className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {activityPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Aktivitäten werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Aktivitäten konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Offen" value={stats.open} />
        <Metric label="Überfällig" value={stats.overdue} tone={stats.overdue ? 'text-status-overdue' : 'text-muted-foreground'} />
        <Metric label={`Fällig in ${DUE_SOON_DAYS} Tagen`} value={stats.dueSoon} tone="text-status-working" />
        <Metric label="Ohne Zuständige:n" value={stats.unassigned} tone={stats.unassigned ? 'text-status-overdue' : 'text-muted-foreground'} />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Aktivitäten nach Art</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={groupByType(acts)}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="count" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Was ist zu tun</h2><div className="divide-y divide-border">
          {open('Überfällige Aufgaben', acts.filter(a => isOverdue(a) && a.type === 'task').length, '/crm/kommunikation/aufgaben')}
          {open('Offene Wiedervorlagen', acts.filter(a => a.type === 'followup' && !a.completed_at).length, '/crm/kommunikation/wiedervorlagen')}
          {open('Anstehende Termine', acts.filter(a => a.type === 'meeting' && !a.completed_at).length, '/crm/kommunikation/termine')}
          {open('Aktivitäten ohne Zuständige:n', stats.unassigned, '/crm/kommunikation/aufgaben')}
          {open('Besuchsberichte', d.visits.length, '/crm/kommunikation/besuchsberichte')}
        </div></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{page?.title ?? 'Neueste Aktivitäten'} <span className="text-xs text-muted-foreground ml-1">{key === 'visits' ? d.visits.length : rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {content()}
      </section>
    </>}
  </CrmLayout>;
}

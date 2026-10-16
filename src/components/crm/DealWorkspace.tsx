import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase, Plus, Loader2, AlertCircle, RefreshCw, ArrowUpRight, ArrowRight,
  Kanban, TrendingUp, Workflow, CalendarClock, UserPlus, Trophy,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  dealPages, effectiveProbability, filterForPage, isCloseOverdue, missingDealData, nextStage,
  overviewStats, pipelineGroups, stageLabel, weightedValue, type Deal, type DealPageKey, type StageProbability,
} from '@/lib/dealPages';
import { cn } from '@/lib/utils';

const icons = { pipeline: Kanban, rate: TrendingUp, stages: Workflow, due: CalendarClock, assign: UserPlus, closed: Trophy };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const money = (n: number, cur = 'EUR') => new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);

async function paged<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await read(from, from + 499);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

function Metric({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

export default function DealWorkspace({ page: key }: { page?: DealPageKey }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = dealPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-deal-workspace', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [deals, companies, contacts, staff, probs, lostReasons] = await Promise.all([
        paged<Deal>((f, t) => supabase.from('deals').select('*').order('id').range(f, t)),
        paged<{ id: string; name: string }>((f, t) => supabase.from('companies').select('id, name').order('id').range(f, t)),
        paged<{ id: string; first_name: string; last_name: string }>((f, t) => supabase.from('contacts').select('id, first_name, last_name').order('id').range(f, t)),
        paged<{ id: string; display_name: string | null; short_code: string | null }>((f, t) => supabase.from('users_profile').select('id, display_name, short_code').order('id').range(f, t)),
        paged<StageProbability>((f, t) => supabase.from('crm_stage_probabilities').select('stage, probability').order('stage').range(f, t)),
        paged<{ id: string; label: string }>((f, t) => supabase.from('lost_reasons').select('id, label').order('label').range(f, t)),
      ]);
      return { deals, companies, contacts, staff, probs, lostReasons };
    },
  });

  const d = query.data;
  const deals = useMemo(() => d?.deals ?? [], [d]);
  const probs = useMemo(() => d?.probs ?? [], [d]);
  const names = useMemo(() => ({
    company: new Map((d?.companies ?? []).map(c => [c.id, c.name])),
    contact: new Map((d?.contacts ?? []).map(c => [c.id, `${c.first_name} ${c.last_name}`.trim()])),
    staff: new Map((d?.staff ?? []).map(s => [s.id, s.display_name || s.short_code || 'Unbekannt'])),
    lost: new Map((d?.lostReasons ?? []).map(r => [r.id, r.label])),
  }), [d]);

  const rows = useMemo(() => filterForPage(key ?? null, deals)
    .filter(x => `${x.title} ${x.deal_no} ${names.company.get(x.company_id ?? '') ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  [deals, key, search, names]);

  const stats = useMemo(() => overviewStats(deals, probs), [deals, probs]);

  const advance = async (deal: Deal) => {
    const next = nextStage(deal);
    if (!next || !user) return;
    setBusy(deal.id);
    const { error } = await supabase.from('deals').update({ stage: next as Deal['stage'] }).eq('id', deal.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Phase geändert: ${stageLabel[next]}`);
    await qc.invalidateQueries({ queryKey: ['crm-deal-workspace', user.id] });
  };

  const takeOver = async (deal: Deal) => {
    if (!user) return;
    setBusy(deal.id);
    const { error } = await supabase.from('deals').update({ owner_id: user.id }).eq('id', deal.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Dir zugewiesen');
    await qc.invalidateQueries({ queryKey: ['crm-deal-workspace', user.id] });
  };

  const stateOf = (deal: Deal) => {
    if (deal.stage === 'won') return <span className="text-status-done">Gewonnen {fmt(deal.won_at)}</span>;
    if (deal.stage === 'lost') return <span className="text-status-overdue">Verloren {fmt(deal.lost_at)}{deal.lost_reason_id ? ` · ${names.lost.get(deal.lost_reason_id) ?? ''}` : ''}</span>;
    if (isCloseOverdue(deal)) return <span className="text-status-overdue">Abschluss überfällig ({fmt(deal.expected_close_date)})</span>;
    return <span className="text-muted-foreground">Abschluss {fmt(deal.expected_close_date)}</span>;
  };

  const open = (label: string, n: number | string, to: string) => <Link key={label} to={to} className="flex justify-between items-center py-3.5 text-xs hover:text-primary"><span>{label}</span><span className="flex gap-3 items-center"><span className="tabular-nums text-lg font-medium">{n}</span><ArrowUpRight className="h-3.5 w-3.5" /></span></Link>;

  const table = (list = rows) => list.length === 0
    ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Verkaufschancen in diesem Bereich.</p>
    : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Chance</th><th className="font-normal">Firma</th><th className="font-normal">Wert</th><th className="font-normal">Phase</th><th className="font-normal">Status</th><th /></tr></thead>
      <tbody>{list.slice(0, 300).map(deal => <tr key={deal.id} className="border-b border-border/60">
        <td className="py-2.5 font-medium"><Link to={`/crm/deals?focus=${deal.id}`} className="hover:text-primary">{deal.title}</Link><div className="text-muted-foreground font-normal">{deal.deal_no}</div></td>
        <td className="text-muted-foreground">{names.company.get(deal.company_id ?? '') ?? '–'}</td>
        <td className="tabular-nums">{money(deal.value_final ?? deal.value_estimated ?? 0, deal.currency)}<div className="text-muted-foreground">{effectiveProbability(deal, probs)} % · gewichtet {money(weightedValue(deal, probs), deal.currency)}</div></td>
        <td>{stageLabel[deal.stage] ?? deal.stage}</td>
        <td>{key === 'rate' && missingDealData(deal).length ? <span className="text-status-working">Fehlt: {missingDealData(deal).join(', ')}</span> : stateOf(deal)}</td>
        <td className="text-right whitespace-nowrap">
          {key === 'assign' && <Button size="sm" variant="outline" disabled={busy === deal.id} onClick={() => void takeOver(deal)}>{busy === deal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Übernehmen'}</Button>}
          {key === 'stages' && nextStage(deal) && <Button size="sm" variant="outline" disabled={busy === deal.id} onClick={() => void advance(deal)}>
            {busy === deal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ArrowRight className="h-3.5 w-3.5 mr-1" />{stageLabel[nextStage(deal)!]}</>}
          </Button>}
          {key !== 'assign' && key !== 'stages' && <Button asChild size="sm" variant="ghost"><Link to={`/crm/deals?focus=${deal.id}`}>Öffnen<ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>}
        </td>
      </tr>)}</tbody></table>
      {list.length > 300 && <p className="text-xs text-muted-foreground py-3">300 von {list.length} angezeigt – Suche verfeinern.</p>}</div>;

  const content = () => {
    if (!d) return null;
    if (key === 'pipeline') {
      const groups = pipelineGroups(rows);
      return <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">{groups.map(g => <div key={g.stage} className="border border-border rounded-lg p-4">
        <div className="flex justify-between text-sm mb-3"><span className="font-medium">{g.label}</span><span className="tabular-nums text-muted-foreground">{g.deals.length} · {money(g.deals.reduce((s, x) => s + (x.value_final ?? x.value_estimated ?? 0), 0))}</span></div>
        <div className="space-y-2">{g.deals.length === 0 ? <p className="text-xs text-muted-foreground">Keine Chancen.</p> : g.deals.slice(0, 12).map(deal => <Link key={deal.id} to={`/crm/deals?focus=${deal.id}`} className="block text-xs border border-border/60 rounded p-2 hover:border-primary">
          <div className="font-medium">{deal.title}</div>
          <div className="text-muted-foreground flex justify-between"><span>{names.company.get(deal.company_id ?? '') ?? '–'}</span><span className="tabular-nums">{money(deal.value_final ?? deal.value_estimated ?? 0, deal.currency)}</span></div>
        </Link>)}{g.deals.length > 12 && <p className="text-xs text-muted-foreground">+{g.deals.length - 12} weitere</p>}</div>
      </div>)}</div>;
    }
    return table();
  };

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Briefcase className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Verkaufschancen</div><h1 className="text-xl font-medium">{page?.title ?? 'Verkaufschancen'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/deals"><ArrowUpRight className="h-4 w-4 mr-1.5" />Vollständige Liste</Link></Button>
        <Button asChild size="sm"><Link to="/crm/deals?action=new"><Plus className="h-4 w-4 mr-1.5" />Chance anlegen</Link></Button>
      </div>
    </header>
    <nav aria-label="Verkaufschancenseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/verkaufschancen' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/verkaufschancen"><Briefcase className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {dealPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Verkaufschancen werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Verkaufschancen konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Offene Chancen" value={stats.open} />
        <Metric label="Offenes Volumen" value={money(stats.openValue)} />
        <Metric label="Gewichtetes Volumen" value={money(stats.weighted)} tone="text-status-working" />
        <Metric label="Gewonnen / Verloren" value={`${stats.won} / ${stats.lost}`} tone="text-status-done" />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Pipeline nach Phase</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={pipelineGroups(deals.filter(x => x.stage !== 'won' && x.stage !== 'lost')).map(g => ({ name: g.label, Anzahl: g.deals.length }))}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="Anzahl" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Was ist zu tun</h2><div className="divide-y divide-border">
          {open('Überfällige Abschlüsse', stats.overdue, '/crm/verkaufschancen/faellig')}
          {open('Chancen ohne Zuständige:n', stats.unassigned, '/crm/verkaufschancen/zuweisen')}
          {open('Chancen mit fehlenden Angaben', deals.filter(x => x.stage !== 'won' && x.stage !== 'lost' && missingDealData(x).length).length, '/crm/verkaufschancen/bewerten')}
          {open('Chancen in Verhandlung', deals.filter(x => x.stage === 'verhandlung').length, '/crm/verkaufschancen/pipeline')}
          {open('Abgeschlossene Chancen', stats.won + stats.lost, '/crm/verkaufschancen/abgeschlossen')}
        </div></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{page?.title ?? 'Zuletzt geänderte Chancen'} <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {content()}
      </section>
    </>}
  </CrmLayout>;
}

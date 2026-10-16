import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Loader2, AlertCircle, RefreshCw, ArrowUpRight, Swords, FolderKanban, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DealCompetitors } from '@/components/crm/DealCompetitors';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { competitorStats, dealPages, isOpenDeal, missingProjectInfo, stageLabel, type Deal } from '@/lib/dealPages';
import { cn } from '@/lib/utils';

export const dealInsightPages = [
  { key: 'competitors', title: 'Mitbewerber', short: 'Mitbewerber', path: '/crm/verkaufschancen/mitbewerber' },
  { key: 'project', title: 'Projektinformationen', short: 'Projektinfos', path: '/crm/verkaufschancen/projekte' },
] as const;

const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

function Metric({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

function ProjectRow({ deal, company, onSaved }: { deal: Deal; company?: string; onSaved: () => void }) {
  const [sop, setSop] = useState(deal.sop ?? '');
  const [addr, setAddr] = useState(deal.delivery_address ?? '');
  const [qty, setQty] = useState(deal.quantity?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const missing = missingProjectInfo(deal);
  const dirty = sop !== (deal.sop ?? '') || addr !== (deal.delivery_address ?? '') || qty !== (deal.quantity?.toString() ?? '');
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('deals').update({ sop: sop.trim() || null, delivery_address: addr.trim() || null, quantity: qty ? Math.round(Number(qty)) : null }).eq('id', deal.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Projektinformationen gespeichert'); onSaved();
  };
  return <tr className="border-b border-border align-top">
    <td className="py-2.5 pr-3 text-xs"><Link to={`/crm/deals/${deal.id}`} className="font-medium hover:text-primary">{deal.title}</Link><div className="text-muted-foreground">{deal.deal_no} · {company ?? 'ohne Firma'} · {stageLabel[deal.stage] ?? deal.stage}</div>
      {missing.length > 0 && <div className="text-status-overdue mt-1">Fehlt: {missing.join(', ')}</div>}</td>
    <td className="py-2.5 pr-2"><Input value={sop} onChange={e => setSop(e.target.value)} placeholder="z. B. Q2/2027" className="h-8 text-xs" aria-label="SOP" /></td>
    <td className="py-2.5 pr-2"><Input value={addr} onChange={e => setAddr(e.target.value)} placeholder="Lieferadresse" className="h-8 text-xs" aria-label="Lieferadresse" /></td>
    <td className="py-2.5 pr-2 w-28"><Input type="number" min={0} value={qty} onChange={e => setQty(e.target.value)} className="h-8 text-xs" aria-label="Menge" /></td>
    <td className="py-2.5 text-right"><Button size="sm" variant={dirty ? 'default' : 'ghost'} disabled={!dirty || saving} onClick={save}><Save className="h-3.5 w-3.5 mr-1" />Speichern</Button></td>
  </tr>;
}

export default function DealInsightsWorkspace({ page: key }: { page: 'competitors' | 'project' }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = dealInsightPages.find(p => p.key === key)!;
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-deal-insights', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [deals, companies, links, competitors] = await Promise.all([
        supabase.from('deals').select('*').order('updated_at', { ascending: false }).limit(1000),
        supabase.from('companies').select('id, name').limit(5000),
        supabase.from('deal_competitors').select('deal_id, competitor_id').limit(5000),
        supabase.from('competitors').select('id, name').order('name'),
      ]);
      const err = deals.error || companies.error || links.error || competitors.error;
      if (err) throw new Error(err.message);
      return { deals: (deals.data ?? []) as Deal[], companies: companies.data ?? [], links: links.data ?? [], competitors: competitors.data ?? [] };
    },
  });
  const reload = () => { void qc.invalidateQueries({ queryKey: ['crm-deal-insights'] }); };

  const d = query.data;
  const companyName = useMemo(() => new Map((d?.companies ?? []).map(c => [c.id, c.name])), [d]);
  const linkCount = useMemo(() => { const m = new Map<string, number>(); (d?.links ?? []).forEach(l => m.set(l.deal_id, (m.get(l.deal_id) ?? 0) + 1)); return m; }, [d]);
  const open = (d?.deals ?? []).filter(isOpenDeal);
  const q = search.trim().toLowerCase();
  const matches = (x: Deal) => !q || [x.title, x.deal_no, x.company_id ? companyName.get(x.company_id) : ''].some(v => (v ?? '').toLowerCase().includes(q));

  const competitorView = () => {
    const stats = competitorStats(d!.links, d!.deals);
    const rows = open.filter(matches).sort((a, b) => (linkCount.get(a.id) ?? 0) - (linkCount.get(b.id) ?? 0) || (b.value_final ?? b.value_estimated ?? 0) - (a.value_final ?? a.value_estimated ?? 0));
    const ranked = d!.competitors.map(c => ({ ...c, ...(stats.get(c.id) ?? { deals: 0, won: 0, lost: 0, open: 0 }) })).filter(c => c.deals > 0).sort((a, b) => b.deals - a.deals);
    return <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Erfasste Mitbewerber" value={d!.competitors.length} />
        <Metric label="Offene Chancen mit Mitbewerber" value={open.filter(x => linkCount.get(x.id)).length} tone="text-status-working" />
        <Metric label="Offene Chancen ohne Angabe" value={open.filter(x => !linkCount.get(x.id)).length} tone={open.some(x => !linkCount.get(x.id)) ? 'text-status-overdue' : ''} />
        <Metric label="Nennungen gesamt" value={d!.links.length} />
      </div>
      <section className="mb-8"><h2 className="text-sm font-medium mb-3">Wettbewerbsübersicht</h2>
        {ranked.length === 0 ? <p className="text-xs text-muted-foreground">Noch keine Mitbewerber bei Verkaufschancen erfasst.</p> :
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="text-muted-foreground border-b border-border"><tr><th className="text-left py-2 font-medium">Mitbewerber</th><th className="text-right font-medium">Chancen</th><th className="text-right font-medium">Offen</th><th className="text-right font-medium">Gewonnen</th><th className="text-right font-medium">Verloren</th></tr></thead>
          <tbody>{ranked.map(c => <tr key={c.id} className="border-b border-border"><td className="py-2 font-medium">{c.name}</td><td className="text-right tabular-nums">{c.deals}</td><td className="text-right tabular-nums">{c.open}</td><td className="text-right tabular-nums text-status-done">{c.won}</td><td className="text-right tabular-nums text-status-overdue">{c.lost}</td></tr>)}</tbody></table></div>}
      </section>
      <section><div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">Mitbewerber je offener Chance <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        <p className="text-xs text-muted-foreground mb-3">Chancen ohne erfassten Mitbewerber stehen oben. Zeile aufklappen, um Mitbewerber zu ergänzen.</p>
        <div className="divide-y divide-border border-y border-border">{rows.map(x => <div key={x.id}>
          <button className="w-full flex items-center gap-2 py-2.5 text-left text-xs hover:bg-muted/40" onClick={() => setOpenId(openId === x.id ? null : x.id)} aria-expanded={openId === x.id}>
            {openId === x.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-medium flex-1">{x.title}<span className="text-muted-foreground font-normal"> · {x.deal_no} · {x.company_id ? companyName.get(x.company_id) : 'ohne Firma'} · {stageLabel[x.stage]}</span></span>
            <span className="tabular-nums text-muted-foreground">{money(x.value_final ?? x.value_estimated ?? 0)}</span>
            <span className={cn('w-28 text-right', linkCount.get(x.id) ? 'text-foreground' : 'text-status-overdue')}>{linkCount.get(x.id) ? `${linkCount.get(x.id)} Mitbewerber` : 'keine Angabe'}</span>
          </button>
          {openId === x.id && <div className="pb-3 pl-6"><DealCompetitors dealId={x.id} /><Button size="sm" variant="ghost" className="mt-2 text-xs" onClick={reload}>Übersicht aktualisieren</Button></div>}
        </div>)}
        {rows.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Keine offenen Chancen.</p>}</div>
      </section>
    </>;
  };

  const projectView = () => {
    const rows = open.filter(matches).sort((a, b) => missingProjectInfo(b).length - missingProjectInfo(a).length || (a.expected_close_date ?? '9999').localeCompare(b.expected_close_date ?? '9999'));
    const complete = open.filter(x => missingProjectInfo(x).length === 0).length;
    return <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Offene Chancen" value={open.length} />
        <Metric label="Projektinfos vollständig" value={complete} tone="text-status-done" />
        <Metric label="Ohne SOP" value={open.filter(x => !x.sop?.trim()).length} tone="text-status-overdue" />
        <Metric label="Ohne Lieferadresse / Menge" value={open.filter(x => !x.delivery_address?.trim() || !x.quantity).length} tone="text-status-overdue" />
      </div>
      <section><div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">Projektangaben je offener Chance <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        <p className="text-xs text-muted-foreground mb-3">Chancen mit fehlenden Angaben stehen oben. SOP, Lieferadresse und Menge direkt in der Zeile pflegen.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-xs"><thead className="text-muted-foreground border-b border-border"><tr><th className="text-left py-2 font-medium">Verkaufschance</th><th className="text-left font-medium">SOP</th><th className="text-left font-medium">Lieferadresse</th><th className="text-left font-medium">Menge</th><th /></tr></thead>
          <tbody>{rows.map(x => <ProjectRow key={`${x.id}-${x.updated_at}`} deal={x} company={x.company_id ? companyName.get(x.company_id) : undefined} onSaved={reload} />)}</tbody></table>
          {rows.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">Keine offenen Chancen.</p>}</div>
      </section>
    </>;
  };

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Briefcase className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Verkaufschancen</div><h1 className="text-xl font-medium">{page.title}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/deals"><ArrowUpRight className="h-4 w-4 mr-1.5" />Vollständige Liste</Link></Button>
      </div>
    </header>
    <nav aria-label="Verkaufschancenseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs"><Link to="/crm/verkaufschancen"><Briefcase className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {dealPages.map(p => <Button asChild key={p.key} size="sm" variant="ghost" className="shrink-0 text-xs"><Link to={p.path}>{p.short}</Link></Button>)}
      {dealInsightPages.map(p => { const I = p.key === 'competitors' ? Swords : FolderKanban; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Verkaufschancen werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Daten konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && (key === 'competitors' ? competitorView() : projectView())}
  </CrmLayout>;
}

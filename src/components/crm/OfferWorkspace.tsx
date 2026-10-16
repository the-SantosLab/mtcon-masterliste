import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Plus, Loader2, AlertCircle, RefreshCw, ArrowUpRight,
  Receipt, Send, History, ShieldCheck, ClipboardList,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { toast } from 'sonner';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  filterForPage, isValidityOverdue, missingOfferData, needsOrder, offerPages,
  overviewStats, statusGroups, statusLabel, type Offer, type OfferPageKey,
} from '@/lib/offerPages';
import { cn } from '@/lib/utils';

const icons = { kalkulation: Receipt, versand: Send, versionen: History, freigegeben: ShieldCheck, auftraege: ClipboardList };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('de-DE') : '–');
const money = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

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

export default function OfferWorkspace({ page: key }: { page?: OfferPageKey }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = offerPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-offer-workspace', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const [offers, companies, contacts, staff] = await Promise.all([
        paged<Offer>((f, t) => supabase.from('offers').select('*').order('id').range(f, t)),
        paged<{ id: string; name: string }>((f, t) => supabase.from('companies').select('id, name').order('id').range(f, t)),
        paged<{ id: string; first_name: string; last_name: string }>((f, t) => supabase.from('contacts').select('id, first_name, last_name').order('id').range(f, t)),
        paged<{ id: string; display_name: string | null; short_code: string | null }>((f, t) => supabase.from('users_profile').select('id, display_name, short_code').order('id').range(f, t)),
      ]);
      return { offers, companies, contacts, staff };
    },
  });

  const d = query.data;
  const offers = useMemo(() => d?.offers ?? [], [d]);
  const names = useMemo(() => ({
    company: new Map((d?.companies ?? []).map(c => [c.id, c.name])),
    contact: new Map((d?.contacts ?? []).map(c => [c.id, `${c.first_name} ${c.last_name}`.trim()])),
    staff: new Map((d?.staff ?? []).map(s => [s.id, s.display_name || s.short_code || 'Unbekannt'])),
  }), [d]);

  const rows = useMemo(() => filterForPage(key ?? null, offers)
    .filter(x => `${x.offer_no} ${names.company.get(x.company_id ?? '') ?? ''}`.toLowerCase().includes(search.toLowerCase())),
  [offers, key, search, names]);

  const stats = useMemo(() => overviewStats(offers), [offers]);

  const takeOver = async (offer: Offer) => {
    if (!user) return;
    setBusy(offer.id);
    const { error } = await supabase.from('offers').update({ owner_id: user.id }).eq('id', offer.id);
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success('Dir zugewiesen');
    await qc.invalidateQueries({ queryKey: ['crm-offer-workspace', user.id] });
  };

  const stateOf = (offer: Offer) => {
    if (offer.status === 'angenommen') return <span className="text-status-done">Angenommen {fmt(offer.accepted_at)}{needsOrder(offer) ? ' · Auftrag offen' : ''}</span>;
    if (offer.status === 'abgelehnt') return <span className="text-status-overdue">Abgelehnt {fmt(offer.rejected_at)}</span>;
    if (offer.status === 'abgelaufen') return <span className="text-status-overdue">Abgelaufen</span>;
    if (isValidityOverdue(offer)) return <span className="text-status-overdue">Gültigkeit überschritten ({fmt(offer.valid_until)})</span>;
    if (offer.status === 'versendet') return <span className="text-muted-foreground">Versendet {fmt(offer.sent_at)} · gültig bis {fmt(offer.valid_until)}</span>;
    return <span className="text-muted-foreground">Entwurf · gültig bis {fmt(offer.valid_until)}</span>;
  };

  const open = (label: string, n: number | string, to: string) => <Link key={label} to={to} className="flex justify-between items-center py-3.5 text-xs hover:text-primary"><span>{label}</span><span className="flex gap-3 items-center"><span className="tabular-nums text-lg font-medium">{n}</span><ArrowUpRight className="h-3.5 w-3.5" /></span></Link>;

  const table = (list = rows) => list.length === 0
    ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Angebote in diesem Bereich.</p>
    : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Angebot</th><th className="font-normal">Firma</th><th className="font-normal">Betrag</th><th className="font-normal">Status</th><th className="font-normal">Zuständig</th><th /></tr></thead>
      <tbody>{list.slice(0, 300).map(offer => <tr key={offer.id} className="border-b border-border/60">
        <td className="py-2.5 font-medium"><Link to={`/crm/offers?focus=${offer.id}`} className="hover:text-primary">{offer.offer_no}</Link><div className="text-muted-foreground font-normal">Version {offer.version ?? 1}</div></td>
        <td className="text-muted-foreground">{names.company.get(offer.company_id ?? '') ?? '–'}<div className="font-normal">{names.contact.get(offer.primary_contact_id ?? '') ?? ''}</div></td>
        <td className="tabular-nums">{offer.total != null ? money(offer.total) : '–'}</td>
        <td>{key === 'kalkulation' && missingOfferData(offer).length ? <span className="text-status-working">Fehlt: {missingOfferData(offer).join(', ')}</span> : stateOf(offer)}</td>
        <td className="text-muted-foreground">{names.staff.get(offer.owner_id ?? '') ?? '–'}</td>
        <td className="text-right whitespace-nowrap">
          {!offer.owner_id && <Button size="sm" variant="outline" disabled={busy === offer.id} onClick={() => void takeOver(offer)}>{busy === offer.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Übernehmen'}</Button>}
          <Button asChild size="sm" variant="ghost"><Link to={`/crm/offers?focus=${offer.id}`}>Öffnen<ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
        </td>
      </tr>)}</tbody></table>
      {list.length > 300 && <p className="text-xs text-muted-foreground py-3">300 von {list.length} angezeigt – Suche verfeinern.</p>}</div>;

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><FileText className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Angebote</div><h1 className="text-xl font-medium">{page?.title ?? 'Angebote'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/offers"><ArrowUpRight className="h-4 w-4 mr-1.5" />Vollständige Liste</Link></Button>
        <Button asChild size="sm"><Link to="/crm/offers?action=new"><Plus className="h-4 w-4 mr-1.5" />Angebot erstellen</Link></Button>
      </div>
    </header>
    <nav aria-label="Angebotsseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/angebote' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/angebote"><FileText className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {offerPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Angebote werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Angebote konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Offene Angebote" value={stats.open} />
        <Metric label="Offenes Volumen" value={money(stats.openValue)} />
        <Metric label="Gültigkeit überschritten" value={stats.overdue} tone="text-status-overdue" />
        <Metric label="Angenommen / Abgelehnt" value={`${stats.accepted} / ${stats.rejected}`} tone="text-status-done" />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Angebote nach Status</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={statusGroups(offers).map(g => ({ name: g.label, Anzahl: g.offers.length }))}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="Anzahl" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Was ist zu tun</h2><div className="divide-y divide-border">
          {open('Gültigkeit überschritten', stats.overdue, '/crm/angebote/versand')}
          {open('Aufträge noch zu erzeugen', stats.needsOrder, '/crm/angebote/auftraege')}
          {open('Entwürfe mit fehlenden Angaben', offers.filter(o => o.status === 'entwurf' && missingOfferData(o).length).length, '/crm/angebote/kalkulation')}
          {open('Offene ohne Zuständige:n', stats.unassigned, '/crm/angebote/versand')}
          {open('Angebotsversionen', offers.filter(o => (o.version ?? 1) > 1 || o.parent_offer_id).length, '/crm/angebote/versionen')}
        </div></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{page?.title ?? 'Zuletzt geänderte Angebote'} <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {table()}
      </section>
    </>}
  </CrmLayout>;
}

import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus, Upload, MapPin, Users, Truck, FileText, Activity, Pencil, Loader2, AlertCircle, RefreshCw, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { companyPages, groupCompanies, isCustomer, isSupplier, missingData, type Company, type CompanyPageKey } from '@/lib/companyPages';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

const icons = { edit: Pencil, locations: MapPin, groups: Users, suppliers: Truck, documents: FileText, history: Activity };
const roleLabel: Record<string, string> = { lead: 'Interessent', customer: 'Kunde', supplier: 'Lieferant', both: 'Kunde & Lieferant' };
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '–';

async function paged<T>(read: (f: number, t: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let f = 0; ; f += 500) { const { data, error } = await read(f, f + 499); if (error) throw new Error(error.message); out.push(...(data ?? [])); if ((data ?? []).length < 500) return out; }
}

function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

export default function CompanyWorkspace({ page: key }: { page?: CompanyPageKey }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const page = companyPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['crm-company-workspace', user?.id], enabled: Boolean(user),
    queryFn: async () => {
      const [companies, locations, contacts, activities, docs] = await Promise.all([
        paged<Company>((f, t) => supabase.from('companies').select('*').eq('is_active', true).order('id').range(f, t)),
        paged<Tables<'company_locations'>>((f, t) => supabase.from('company_locations').select('*').order('id').range(f, t)),
        paged<{ id: string; company_id: string | null }>((f, t) => supabase.from('contacts').select('id, company_id').order('id').range(f, t)),
        paged<{ id: string; company_id: string | null; subject: string; type: string; created_at: string; completed_at: string | null }>((f, t) => supabase.from('crm_activities').select('id, company_id, subject, type, created_at, completed_at').not('company_id', 'is', null).order('id').range(f, t)),
        paged<{ id: string; entity_id: string }>((f, t) => supabase.from('document_links').select('id, entity_id').eq('entity_type', 'company').order('id').range(f, t)),
      ]);
      return { companies, locations, contacts, activities, docs };
    },
  });
  const d = query.data;
  const count = (list: { company_id?: string | null; entity_id?: string }[] | undefined, id: string) => (list ?? []).filter(x => (x.company_id ?? x.entity_id) === id).length;
  const lastActivity = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of d?.activities ?? []) if (a.company_id && (m.get(a.company_id) ?? '') < a.created_at) m.set(a.company_id, a.created_at);
    return m;
  }, [d]);
  const base = useMemo(() => {
    const all = d?.companies ?? [];
    const list = key === 'suppliers' ? all.filter(isSupplier)
      : key === 'documents' ? [...all].sort((a, b) => count(d?.docs, b.id) - count(d?.docs, a.id))
      : key === 'history' ? [...all].sort((a, b) => (lastActivity.get(b.id) ?? b.updated_at).localeCompare(lastActivity.get(a.id) ?? a.updated_at))
      : key === 'edit' || !key ? [...all].sort((a, b) => missingData(b).length - missingData(a).length)
      : all;
    return list.filter(c => `${c.name} ${c.customer_no ?? ''} ${c.supplier_code ?? ''} ${c.industry ?? ''} ${c.billing_city ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, key, search, lastActivity]);
  const all = d?.companies ?? [];
  const incomplete = all.filter(c => missingData(c).length > 0);

  const table = (head: string, cell: (c: Company) => React.ReactNode, rows = base) => rows.length === 0
    ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Firmen in diesem Bereich.</p>
    : <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Firma</th><th className="font-normal">Rolle</th><th className="font-normal">Ort</th><th className="font-normal">{head}</th><th /></tr></thead>
      <tbody>{rows.slice(0, 300).map(c => <tr key={c.id} className="border-b border-border/60"><td className="py-2.5 font-medium">{c.name}<div className="text-muted-foreground font-normal">{c.customer_no ?? c.supplier_code ?? ''}</div></td><td>{roleLabel[c.partner_role]}</td><td className="text-muted-foreground">{c.billing_city ?? c.shipping_city ?? '–'}</td><td>{cell(c)}</td><td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/crm/companies/${c.id}`}>Öffnen<ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button></td></tr>)}</tbody></table>
      {rows.length > 300 && <p className="text-xs text-muted-foreground py-3">300 von {rows.length} angezeigt – Suche verfeinern.</p>}</div>;

  const content = () => {
    if (!d) return null;
    if (key === 'locations') {
      const byCompany = new Map(all.map(c => [c.id, c.name]));
      const locs = d.locations.filter(l => `${byCompany.get(l.company_id) ?? ''} ${l.name} ${l.city ?? ''}`.toLowerCase().includes(search.toLowerCase()));
      const without = base.filter(c => !c.billing_street && !c.address && count(d.locations, c.id) === 0);
      return <><h2 className="text-sm font-medium mb-3">Standorte <span className="text-xs text-muted-foreground">{locs.length}</span></h2>
        {locs.length === 0 ? <p className="text-xs text-muted-foreground py-6">Noch keine zusätzlichen Standorte erfasst.</p> : <div className="overflow-x-auto mb-8"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Firma</th><th className="font-normal">Standort</th><th className="font-normal">Art</th><th className="font-normal">Adresse</th><th /></tr></thead><tbody>{locs.slice(0, 300).map(l => <tr key={l.id} className="border-b border-border/60"><td className="py-2.5">{byCompany.get(l.company_id) ?? '–'}</td><td className="font-medium">{l.name}</td><td className="text-muted-foreground">{l.location_type}</td><td>{[l.street, [l.zip, l.city].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ') || '–'}</td><td className="text-right"><Button asChild size="sm" variant="ghost"><Link to={`/crm/companies/${l.company_id}`}>Öffnen</Link></Button></td></tr>)}</tbody></table></div>}
        <h2 className="text-sm font-medium mb-3 mt-8">Ohne Adresse <span className="text-xs text-muted-foreground">{without.length}</span></h2>{table('Hinweis', () => <span className="text-status-overdue">Adresse fehlt</span>, without)}</>;
    }
    if (key === 'groups') {
      const groups = groupCompanies(base);
      return <div className="grid md:grid-cols-2 gap-x-8">{groups.map(g => <div key={g.name} className="border-b border-border py-4"><div className="flex justify-between text-sm mb-2"><span className="font-medium">{g.name}</span><span className="tabular-nums text-muted-foreground">{g.members.length}</span></div><div className="flex flex-wrap gap-1.5">{g.members.slice(0, 20).map(c => <Link key={c.id} to={`/crm/companies/${c.id}`} className="text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary">{c.name}</Link>)}{g.members.length > 20 && <span className="text-xs text-muted-foreground py-1">+{g.members.length - 20}</span>}</div></div>)}</div>;
    }
    if (key === 'suppliers') return table('Zahlungsziel', c => c.payment_terms_days != null ? `${c.payment_terms_days} Tage` : '–');
    if (key === 'documents') return table('Dokumente', c => <span className="tabular-nums">{count(d.docs, c.id)}</span>);
    if (key === 'history') return table('Letzte Aktivität', c => { const a = d.activities.filter(x => x.company_id === c.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]; return a ? <span>{a.subject} <span className="text-muted-foreground">· {fmt(a.created_at)}</span></span> : <span className="text-muted-foreground">Keine</span>; });
    return table(key ? 'Fehlende Daten' : 'Stammdaten', c => { const m = missingData(c); return m.length ? <span className="text-status-working">{m.join(', ')}</span> : <span className="text-status-done">Vollständig</span>; });
  };

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Building2 className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Kundenfirmen & Partner</div><h1 className="text-xl font-medium">{page?.title ?? 'Kundenfirmen & Partner'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/companies?action=import"><Upload className="h-4 w-4 mr-1.5" />Importieren</Link></Button>
        <Button asChild size="sm"><Link to="/crm/companies?action=new"><Plus className="h-4 w-4 mr-1.5" />Firma / Partner anlegen</Link></Button>
      </div>
    </header>
    <nav aria-label="Firmenseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/firmen' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/firmen"><Building2 className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {companyPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs"><Link to="/crm/companies"><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Vollständige Liste</Link></Button>
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Firmen werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Firmen konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : d && <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Kunden" value={all.filter(isCustomer).length} tone="text-status-done" />
        <Metric label="Lieferanten" value={all.filter(isSupplier).length} />
        <Metric label="Ohne Ansprechpartner" value={all.filter(c => count(d.contacts, c.id) === 0).length} tone="text-status-working" />
        <Metric label="Stammdaten unvollständig" value={incomplete.length} tone={incomplete.length ? 'text-status-overdue' : 'text-muted-foreground'} />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Partner nach Rolle</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={Object.keys(roleLabel).map(r => ({ name: roleLabel[r], Anzahl: all.filter(c => c.partner_role === r).length }))}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="Anzahl" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Datenqualität</h2><div className="divide-y divide-border">{[
          { label: 'Rechnungsadresse fehlt', n: all.filter(c => missingData(c).includes('Rechnungsadresse')).length, to: '/crm/firmen/standorte' },
          { label: 'Kundennummer fehlt', n: all.filter(c => missingData(c).includes('Kundennummer')).length, to: '/crm/firmen/bearbeiten' },
          { label: 'Ohne Dokumente', n: all.filter(c => count(d.docs, c.id) === 0).length, to: '/crm/firmen/dokumente' },
          { label: 'Ohne Aktivität', n: all.filter(c => !lastActivity.has(c.id)).length, to: '/crm/firmen/historie' },
        ].map(i => <Link key={i.label} to={i.to} className="flex justify-between items-center py-3.5 text-xs hover:text-primary"><span>{i.label}</span><span className="flex gap-3 items-center"><span className="tabular-nums text-lg font-medium">{i.n}</span><ArrowUpRight className="h-3.5 w-3.5" /></span></Link>)}</div></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{page?.title ?? 'Stammdaten prüfen'} <span className="text-xs text-muted-foreground ml-1">{base.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {content()}
      </section>
    </>}
  </CrmLayout>;
}

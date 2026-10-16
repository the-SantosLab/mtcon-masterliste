import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Target, Plus, Upload, ShieldCheck, Star, Workflow, Building2, FolderArchive, Activity, Loader2, AlertCircle, RefreshCw, Check, RotateCcw, UserPlus, ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useAcquisition } from '@/hooks/useAcquisition';
import { leadPages, leadsForPage, scoreBand, isProtected, type LeadPageKey } from '@/lib/leadPipeline';
import type { AcquisitionLead } from '@/lib/acquisition';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const icons = { qualify: ShieldCheck, score: Star, assign: Workflow, convert: Building2, archive: FolderArchive, history: Activity };
const statusLabel: Record<string, string> = { neu: 'Neu', qualifiziert: 'Qualifiziert', eingeschrieben: 'In Kampagne', konvertiert: 'Kunde', abgelehnt: 'Archiviert' };
const bandLabel = { hot: 'Heiß', warm: 'Warm', cold: 'Kalt' };
const bandTone = { hot: 'text-status-overdue', warm: 'text-status-working', cold: 'text-muted-foreground' };
const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE') : '–';

function Metric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className="py-4 px-4 border-l border-border first:border-l-0"><div className={cn('text-3xl font-medium tabular-nums', tone)}>{value}</div><div className="text-xs text-muted-foreground mt-1">{label}</div></div>;
}

export default function LeadWorkspace({ page: key }: { page?: LeadPageKey }) {
  const query = useAcquisition();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { pathname } = useLocation();
  const page = leadPages.find(p => p.key === key);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<AcquisitionLead | null>(null);
  const [converting, setConverting] = useState<AcquisitionLead | null>(null);
  const [reason, setReason] = useState('');
  const data = query.data;
  const leads = data?.leads ?? [];
  const rows = useMemo(() => (key ? leadsForPage(key, leads) : leads.filter(l => l.status === 'neu'))
    .filter(l => `${l.company_name} ${l.contact_name ?? ''} ${l.industry ?? ''}`.toLowerCase().includes(search.toLowerCase())), [key, leads, search]);
  const open = leads.filter(l => !['konvertiert', 'abgelehnt'].includes(l.status));
  const refresh = () => qc.invalidateQueries({ queryKey: ['crm-acquisition', user?.id] });

  const update = async (lead: AcquisitionLead, patch: Partial<AcquisitionLead>, msg: string) => {
    setBusy(lead.id);
    const { error } = await supabase.from('leads').update(patch as never).eq('id', lead.id);
    setBusy(null);
    if (error) { toast.error(error.message); return false; }
    toast.success(msg); await refresh(); return true;
  };
  const convert = async (l: AcquisitionLead) => {
    setBusy(l.id);
    try {
      const { data: comp, error } = await supabase.from('companies').insert({ name: l.company_name, website: l.website, country: l.country, industry: l.industry, type: 'kunde' as never, owner_id: user?.id }).select('id').single();
      if (error) throw error;
      if (l.contact_name) {
        const [first, ...rest] = l.contact_name.split(' ');
        const { error: ce } = await supabase.from('contacts').insert({ company_id: comp.id, first_name: first, last_name: rest.join(' ') || '–', email: l.email, phone: l.phone });
        if (ce) throw ce;
      }
      const { error: le } = await supabase.from('leads').update({ status: 'konvertiert', converted_company_id: comp.id }).eq('id', l.id);
      if (le) throw le;
      toast.success('Als Kunde angelegt'); setConverting(null); await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Umwandlung fehlgeschlagen'); }
    finally { setBusy(null); }
  };

  const actions = (l: AcquisitionLead) => {
    const b = busy === l.id;
    if (key === 'qualify' || !key) return <><Button size="sm" variant="outline" disabled={b} onClick={() => void update(l, { status: 'qualifiziert' }, 'Qualifiziert')}><Check className="h-3.5 w-3.5 mr-1" />Qualifizieren</Button><Button size="sm" variant="ghost" disabled={b} onClick={() => { setArchiving(l); setReason(''); }}>Archivieren</Button></>;
    if (key === 'assign') return l.assigned_to === user?.id ? <span className="text-xs text-muted-foreground">Mir zugewiesen</span> : <Button size="sm" variant="outline" disabled={b} onClick={() => void update(l, { assigned_to: user?.id ?? null }, 'Zugewiesen')}><UserPlus className="h-3.5 w-3.5 mr-1" />Übernehmen</Button>;
    if (key === 'convert') return <Button size="sm" disabled={b} onClick={() => setConverting(l)}><Building2 className="h-3.5 w-3.5 mr-1" />Umwandeln</Button>;
    if (key === 'archive') return <Button size="sm" variant="outline" disabled={b} onClick={() => void update(l, { status: 'neu', rejection_reason: null }, 'Wiederhergestellt')}><RotateCcw className="h-3.5 w-3.5 mr-1" />Reaktivieren</Button>;
    return null;
  };
  const detail = (l: AcquisitionLead) => {
    if (key === 'score') { const band = scoreBand(l.score); return <span className={cn('tabular-nums', bandTone[band])}>{l.score} · {bandLabel[band]}</span>; }
    if (key === 'archive') return l.rejection_reason ?? '–';
    if (key === 'assign') return l.assigned_to ? (l.assigned_to === user?.id ? 'Ich' : 'Zugewiesen') : <span className="text-status-overdue">Offen</span>;
    if (key === 'history') { const n = data?.activities.filter(a => a.lead_id === l.id).length ?? 0; return `${n} Aktivitäten · ${fmt(l.status_changed_at ?? l.updated_at)}`; }
    if (key === 'qualify' || !key) return isProtected(l) ? <span className="text-status-done">Geschützt bis {fmt(l.protected_until)}</span> : l.email || l.phone ? 'Kontaktdaten vorhanden' : <span className="text-status-working">Kontaktdaten fehlen</span>;
    return statusLabel[l.status];
  };
  const detailHead = { score: 'Bewertung', archive: 'Grund', assign: 'Zuständig', history: 'Verlauf', convert: 'Status', qualify: 'Prüfung' }[key ?? 'qualify'];

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><Target className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Neue Interessenten</div><h1 className="text-xl font-medium">{page?.title ?? 'Neue Interessenten'}</h1></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
        <Button asChild size="sm" variant="outline"><Link to="/crm/outbound/leads?action=import"><Upload className="h-4 w-4 mr-1.5" />Importieren</Link></Button>
        <Button asChild size="sm"><Link to="/crm/outbound/leads?action=new"><Plus className="h-4 w-4 mr-1.5" />Interessent anlegen</Link></Button>
      </div>
    </header>
    <nav aria-label="Interessentenseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant={pathname === '/crm/interessenten' ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to="/crm/interessenten"><Target className="h-3.5 w-3.5 mr-1.5" />Übersicht</Link></Button>
      {leadPages.map(p => { const I = icons[p.key]; return <Button asChild key={p.key} size="sm" variant={pathname === p.path ? 'secondary' : 'ghost'} className="shrink-0 text-xs"><Link to={p.path}><I className="h-3.5 w-3.5 mr-1.5" />{p.short}</Link></Button>; })}
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs"><Link to="/crm/outbound/leads?view=board"><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Board</Link></Button>
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Interessenten werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Interessenten konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : <>
      <div className="grid grid-cols-2 md:grid-cols-4 border-y border-border mb-7">
        <Metric label="Neu" value={leads.filter(l => l.status === 'neu').length} tone="text-status-working" />
        <Metric label="Qualifiziert" value={leads.filter(l => l.status === 'qualifiziert').length} tone="text-status-done" />
        <Metric label="Ohne Zuständigen" value={open.filter(l => !l.assigned_to).length} tone={open.some(l => !l.assigned_to) ? 'text-status-overdue' : 'text-muted-foreground'} />
        <Metric label="Zu Kunden umgewandelt" value={leads.filter(l => l.status === 'konvertiert').length} />
      </div>
      {!key && <section className="grid lg:grid-cols-2 gap-8 mb-8">
        <div><h2 className="text-sm font-medium mb-4">Trichter</h2><div className="h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={['neu', 'qualifiziert', 'eingeschrieben', 'konvertiert', 'abgelehnt'].map(s => ({ name: statusLabel[s], Anzahl: leads.filter(l => l.status === s).length }))}><XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip cursor={false} content={({ active, payload }) => active && payload?.length ? <div className="rounded border border-border bg-popover p-2 text-xs">{String(payload[0]?.payload.name)}: {payload[0]?.value}</div> : null} /><Bar dataKey="Anzahl" fill="hsl(var(--status-working))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
        <div><h2 className="text-sm font-medium mb-3">Bewertung offener Interessenten</h2><div className="divide-y divide-border">{(['hot', 'warm', 'cold'] as const).map(b => <Link key={b} to="/crm/interessenten/bewerten" className="flex justify-between py-4 text-xs hover:text-primary"><span>{bandLabel[b]}</span><span className={cn('tabular-nums text-lg font-medium', bandTone[b])}>{open.filter(l => scoreBand(l.score) === b).length}</span></Link>)}</div>
          <Link to="/crm/settings/scoring" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-2">Bewertungsregeln<ArrowUpRight className="h-3 w-3" /></Link></div>
      </section>}
      <section>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">{key ? page?.title : 'Neu eingegangen'} <span className="text-xs text-muted-foreground ml-1">{rows.length}</span></h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
        {rows.length === 0 ? <p className="text-xs text-muted-foreground py-8 text-center">Keine Interessenten in diesem Bereich.</p> :
        <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground border-b border-border"><th className="py-2 font-normal">Firma</th><th className="font-normal">Ansprechpartner</th><th className="font-normal">Quelle</th><th className="font-normal">Angelegt</th><th className="font-normal">{detailHead}</th><th /></tr></thead>
          <tbody>{rows.map(l => <tr key={l.id} className="border-b border-border/60"><td className="py-2.5 font-medium">{l.company_name}</td><td>{l.contact_name ?? '–'}</td><td className="text-muted-foreground">{l.source}</td><td className="text-muted-foreground">{fmt(l.created_at)}</td><td>{detail(l)}</td><td className="text-right"><div className="flex justify-end gap-1">{actions(l)}</div></td></tr>)}</tbody></table></div>}
      </section>
    </>}
    <Dialog open={Boolean(archiving)} onOpenChange={o => !o && setArchiving(null)}><DialogContent><DialogHeader><DialogTitle>Interessent archivieren</DialogTitle><DialogDescription>{archiving?.company_name}</DialogDescription></DialogHeader><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Grund" /><DialogFooter><Button variant="ghost" onClick={() => setArchiving(null)}>Abbrechen</Button><Button disabled={!reason.trim() || busy !== null} onClick={async () => { if (archiving && await update(archiving, { status: 'abgelehnt', rejection_reason: reason.trim() }, 'Archiviert')) setArchiving(null); }}>Archivieren</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(converting)} onOpenChange={o => !o && setConverting(null)}><DialogContent><DialogHeader><DialogTitle>In Kunde umwandeln</DialogTitle><DialogDescription>{converting?.company_name} wird als Kundenfirma{converting?.contact_name ? ` mit Ansprechpartner ${converting.contact_name}` : ''} angelegt.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setConverting(null)}>Abbrechen</Button><Button disabled={busy !== null} onClick={() => converting && void convert(converting)}>Umwandeln</Button></DialogFooter></DialogContent></Dialog>
  </CrmLayout>;
}

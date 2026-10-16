import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, Loader2, AlertCircle, RefreshCw, ArrowUpRight, Workflow } from 'lucide-react';
import { CrmLayout } from '@/components/CrmLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { offerPages, statusLabel } from '@/lib/offerPages';
import { involvedDepartments, shapeForDepartments, shapeLabel, type ProcessShape } from '@/lib/processShape';
import { cn } from '@/lib/utils';

const order: ProcessShape[] = ['point', 'line', 'triangle', 'square', 'multi'];
const corners: Record<ProcessShape, string> = { point: '1 Abteilung', line: '2 Abteilungen', triangle: '3 Abteilungen', square: '4 Abteilungen', multi: '5+ Abteilungen' };
const money = (n: number | null) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n ?? 0);

function ShapeIcon({ shape }: { shape: ProcessShape }) {
  const c = 'stroke-current fill-none';
  return <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden>
    {shape === 'point' && <circle cx="12" cy="12" r="3" className="fill-current" />}
    {shape === 'line' && <><line x1="4" y1="12" x2="20" y2="12" className={c} /><circle cx="4" cy="12" r="2" className="fill-current" /><circle cx="20" cy="12" r="2" className="fill-current" /></>}
    {shape === 'triangle' && <polygon points="12,4 20,19 4,19" className={c} />}
    {shape === 'square' && <rect x="5" y="5" width="14" height="14" className={c} />}
    {shape === 'multi' && <polygon points="12,3 20,9 17,19 7,19 4,9" className={c} />}
  </svg>;
}

type Row = { id: string; offer_no: string | null; status: string; total: number | null; company: string; caseId: string | null; caseNo: string | null; project: string | null; depts: string[]; shape: ProcessShape | null };

export default function OfferShapeWorkspace() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['crm-offer-shapes', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const offers = await supabase.from('offers').select('id, offer_no, status, total, company_id, case_id').order('created_at', { ascending: false }).limit(1000);
      if (offers.error) throw new Error(offers.error.message);
      const caseIds = [...new Set((offers.data ?? []).map(o => o.case_id).filter(Boolean))] as string[];
      const [cases, tasks, depts, companies] = await Promise.all([
        caseIds.length ? supabase.from('cases').select('id, case_no, project_name, client_name, department_id, process_shape').in('id', caseIds) : Promise.resolve({ data: [], error: null }),
        caseIds.length ? supabase.from('case_tasks').select('case_id, department_id').in('case_id', caseIds).limit(10000) : Promise.resolve({ data: [], error: null }),
        supabase.from('departments').select('id, name'),
        supabase.from('companies').select('id, name').limit(5000),
      ]);
      const err = cases.error || tasks.error || depts.error || companies.error;
      if (err) throw new Error(err.message);
      const deptName = new Map((depts.data ?? []).map(d => [d.id, d.name]));
      const companyName = new Map((companies.data ?? []).map(c => [c.id, c.name]));
      const caseMap = new Map((cases.data ?? []).map((c: any) => [c.id, c]));
      const rows: Row[] = (offers.data ?? []).map(o => {
        const c: any = o.case_id ? caseMap.get(o.case_id) : null;
        const ids = c ? involvedDepartments(c.department_id, (tasks.data ?? []).filter((t: any) => t.case_id === c.id).map((t: any) => t.department_id)) : [];
        return { id: o.id, offer_no: o.offer_no, status: o.status, total: o.total, company: o.company_id ? companyName.get(o.company_id) ?? '–' : 'ohne Firma',
          caseId: c?.id ?? null, caseNo: c?.case_no ?? null, project: c?.project_name ?? c?.client_name ?? null,
          depts: ids.map(i => deptName.get(i) ?? 'Unbekannt'), shape: c ? shapeForDepartments(ids.length) : null };
      });
      return rows;
    },
  });

  const rows = query.data ?? [];
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => rows.filter(r => !q || [r.offer_no, r.company, r.caseNo, r.project, ...r.depts].some(v => (v ?? '').toLowerCase().includes(q))), [rows, q]);
  const withoutCase = visible.filter(r => !r.caseId);

  return <CrmLayout>
    <header className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div><div className="flex items-center gap-2 text-xs text-muted-foreground mb-2"><FileText className="h-3.5 w-3.5" />Kunden gewinnen<span>/</span>Angebote</div><h1 className="text-xl font-medium">Punkt / Linie / Dreieck / Quadrat</h1>
        <p className="text-xs text-muted-foreground mt-1">Die Form eines Vorgangs zeigt, wie viele Abteilungen beteiligt sind: Punkt 1, Linie 2, Dreieck 3, Quadrat 4.</p></div>
      <Button variant="outline" size="icon" aria-label="Aktualisieren" onClick={() => void query.refetch()}><RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} /></Button>
    </header>
    <nav aria-label="Angebotsseiten" className="flex gap-1 overflow-x-auto border-b border-border pb-3 mb-6">
      <Button asChild size="sm" variant="ghost" className="shrink-0 text-xs"><Link to="/crm/angebote">Übersicht</Link></Button>
      {offerPages.map(p => <Button asChild key={p.key} size="sm" variant="ghost" className="shrink-0 text-xs"><Link to={p.path}>{p.short}</Link></Button>)}
      <Button asChild size="sm" variant="secondary" className="shrink-0 text-xs"><Link to="/crm/angebote/prozessform"><Workflow className="h-3.5 w-3.5 mr-1.5" />Prozessform</Link></Button>
    </nav>
    {query.isLoading ? <div role="status" className="flex justify-center gap-2 text-muted-foreground py-20"><Loader2 className="h-5 w-5 animate-spin" />Angebote werden geladen…</div>
    : query.isError ? <div role="alert" className="py-12 text-center space-y-3"><AlertCircle className="h-6 w-6 mx-auto text-destructive" /><p>Daten konnten nicht geladen werden.</p><Button variant="outline" onClick={() => void query.refetch()}>Erneut versuchen</Button></div>
    : <>
      <div className="grid grid-cols-2 md:grid-cols-5 border-y border-border mb-7">
        {order.map(s => <div key={s} className="py-4 px-4 border-l border-border first:border-l-0"><div className="flex items-center gap-2"><ShapeIcon shape={s} /><span className="text-3xl font-medium tabular-nums">{rows.filter(r => r.shape === s).length}</span></div><div className="text-xs text-muted-foreground mt-1">{shapeLabel[s]} · {corners[s]}</div></div>)}
      </div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap"><h2 className="text-sm font-medium">Angebote mit Vorgang nach Form</h2><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="h-8 w-56 text-xs" /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        {order.filter(s => s !== 'multi' || visible.some(r => r.shape === 'multi')).map(s => { const list = visible.filter(r => r.shape === s); return <section key={s} className="border border-border rounded-md p-3">
          <h3 className="flex items-center gap-2 text-xs font-medium mb-3"><ShapeIcon shape={s} />{shapeLabel[s]}<span className="text-muted-foreground font-normal">{corners[s]} · {list.length}</span></h3>
          <div className="space-y-2">{list.length === 0 ? <p className="text-xs text-muted-foreground">Keine Angebote.</p> : list.slice(0, 30).map(r => <div key={r.id} className="text-xs border border-border/60 rounded p-2">
            <div className="flex justify-between gap-2"><Link to={`/crm/offers/${r.id}`} className="font-medium hover:text-primary">{r.offer_no ?? 'Angebot'}</Link><span className="tabular-nums text-muted-foreground">{money(r.total)}</span></div>
            <div className="text-muted-foreground">{r.company} · {statusLabel[r.status] ?? r.status}</div>
            <Link to={`/cases/${r.caseId}`} className="block mt-1 hover:text-primary">{r.caseNo}{r.project ? ` · ${r.project}` : ''}</Link>
            <div className="text-muted-foreground mt-1">{r.depts.join(' · ')}</div>
          </div>)}</div>
        </section>; })}
      </div>
      <section><h2 className="text-sm font-medium mb-1">Noch ohne Vorgang <span className="text-xs text-muted-foreground ml-1">{withoutCase.length}</span></h2>
        <p className="text-xs text-muted-foreground mb-3">Die Form ergibt sich erst, wenn zum Angebot ein Vorgang mit Abteilungen existiert.</p>
        <div className="divide-y divide-border border-y border-border">{withoutCase.slice(0, 50).map(r => <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-xs">
          <span><span className="font-medium">{r.offer_no ?? 'Angebot'}</span><span className="text-muted-foreground"> · {r.company} · {statusLabel[r.status] ?? r.status}</span></span>
          <Button asChild size="sm" variant="ghost"><Link to={`/crm/offers/${r.id}`}>Öffnen<ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
        </div>)}{withoutCase.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Alle Angebote haben einen Vorgang.</p>}</div>
      </section>
    </>}
  </CrmLayout>;
}

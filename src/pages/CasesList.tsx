import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useCaseActions } from '@/hooks/useCaseActions';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, canClaim, isTerminalStatus, STATUS_LABELS } from '@/lib/case-utils';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type CaseRow = Tables<'cases'> & { assignee: { display_name: string; short_code: string } | null };

export default function CasesList() {
  const { user, isAdmin, isViewer } = useAuth();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [profiles, setProfiles] = useState<Tables<'users_profile'>[]>([]);
  const [customers, setCustomers] = useState<Tables<'customers'>[]>([]);
  const [products, setProducts] = useState<Tables<'products'>[]>([]);
  const [areas, setAreas] = useState<Tables<'internal_areas'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [searchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  const fetchCases = async () => {
    const { data } = await supabase
      .from('cases')
      .select('*, assignee:users_profile!cases_assignee_id_fkey(display_name, short_code)')
      .order('created_at', { ascending: false });
    setCases((data as CaseRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCases();
    supabase.from('users_profile').select('*').then(r => setProfiles(r.data || []));
    supabase.from('customers').select('*').then(r => setCustomers(r.data || []));
    supabase.from('products').select('*').then(r => setProducts(r.data || []));
    supabase.from('internal_areas').select('*').then(r => setAreas(r.data || []));
    const ch = supabase.channel('list-cases').on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => fetchCases()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'mine') setAssigneeFilter(user?.id || 'all');
    if (f === 'available') setAssigneeFilter('unassigned');
  }, [searchParams, user]);

  const { claimCase, unclaimCase, completeCase } = useCaseActions(user?.id, fetchCases);

  const filtered = cases.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (assigneeFilter === 'unassigned' && c.assignee_id !== null) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && c.assignee_id !== assigneeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (![c.case_no, c.project_name, c.client_name, c.project_article_no].some(v => v?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-4 max-w-6xl">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vorgänge</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Masterliste aller Vorgänge</p>
          </div>
          {!isViewer && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-8 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />Neuer Vorgang
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className="text-sm font-semibold">Neuen Vorgang anlegen</DialogTitle></DialogHeader>
                <CreateCaseForm customers={customers} products={products} areas={areas} userId={user?.id || ''} onCreated={() => { setCreateOpen(false); fetchCases(); }} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche" className="pl-9 h-8 text-xs" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              {Constants.public.Enums.case_status.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Bearbeiter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.short_code}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Nr.</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Projektname</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Bearbeiter</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Kunde</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Endtermin</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">Laden</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">Keine Vorgänge gefunden</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-2.5 font-mono">
                    <Link to={`/cases/${c.id}`} className="text-primary hover:underline">{c.case_no}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">
                    <Link to={`/cases/${c.id}`} className="hover:text-primary transition-colors">{c.project_name}</Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.assignee?.short_code || '–'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{c.customer_no || '–'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{formatDate(c.due_at)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {!isViewer && canClaim(c.status, c.assignee_id) && (
                        <button onClick={() => claimCase(c.id)} className="text-primary hover:underline text-xs font-medium">Abholen</button>
                      )}
                      {!isViewer && c.assignee_id === user?.id && !isTerminalStatus(c.status) && (
                        <button onClick={() => unclaimCase(c.id)} className="text-muted-foreground hover:text-foreground text-xs">Freigeben</button>
                      )}
                      {!isViewer && (c.assignee_id === user?.id || isAdmin) && !isTerminalStatus(c.status) && (
                        <button onClick={() => completeCase(c.id)} className="text-muted-foreground hover:text-foreground text-xs ml-1">Abschließen</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">{filtered.length} Vorgang/Vorgänge</p>
      </div>
    </AppLayout>
  );
}

function CreateCaseForm({ customers, products, areas, userId, onCreated }: {
  customers: Tables<'customers'>[]; products: Tables<'products'>[]; areas: Tables<'internal_areas'>[];
  userId: string; onCreated: () => void;
}) {
  const [form, setForm] = useState({ case_no: '', project_name: '', customer_no: '', client_name: '', internal_area_code: '', product_code: '', project_article_no: '', received_at: '', due_at: '', note: '', estimated_hours: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.case_no || !form.project_name) { toast.error('Nr. und Projektname sind Pflicht'); return; }
    setSaving(true);
    const { error } = await supabase.from('cases').insert({
      case_no: form.case_no, project_name: form.project_name, customer_no: form.customer_no || null,
      client_name: form.client_name || null, internal_area_code: form.internal_area_code || null,
      product_code: form.product_code || null, project_article_no: form.project_article_no || null,
      received_at: form.received_at || null, due_at: form.due_at || null, note: form.note || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      created_by: userId, last_changed_by: userId, last_changed_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    await supabase.from('case_activity').insert({ case_id: (await supabase.from('cases').select('id').eq('case_no', form.case_no).order('created_at', { ascending: false }).limit(1).single()).data?.id || '', action: 'CREATE', actor_id: userId });
    toast.success('Vorgang erstellt');
    onCreated();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Vorgangsnummer *</Label><Input value={form.case_no} onChange={e => set('case_no', e.target.value)} placeholder="VG-001" required className="h-8 text-xs" /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Projektname *</Label><Input value={form.project_name} onChange={e => set('project_name', e.target.value)} placeholder="Projekt Alpha" required className="h-8 text-xs" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Kunde</Label>
          <Select value={form.customer_no} onValueChange={v => set('customer_no', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen" /></SelectTrigger>
            <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.customer_no}>{c.customer_no} – {c.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Auftraggeber</Label><Input value={form.client_name} onChange={e => set('client_name', e.target.value)} className="h-8 text-xs" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Produkt</Label>
          <Select value={form.product_code} onValueChange={v => set('product_code', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen" /></SelectTrigger>
            <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.code}>{p.code} – {p.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Bereich intern</Label>
          <Select value={form.internal_area_code} onValueChange={v => set('internal_area_code', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen" /></SelectTrigger>
            <SelectContent>{areas.map(a => <SelectItem key={a.id} value={a.code}>{a.code} – {a.name}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Projekt-/Artikelnummer</Label><Input value={form.project_article_no} onChange={e => set('project_article_no', e.target.value)} className="h-8 text-xs" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Auftragseingang</Label><Input type="date" value={form.received_at} onChange={e => set('received_at', e.target.value)} className="h-8 text-xs" /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Endtermin</Label><Input type="date" value={form.due_at} onChange={e => set('due_at', e.target.value)} className="h-8 text-xs" /></div>
        <div className="space-y-1"><Label className="text-xs text-muted-foreground">Geschätzte Std.</Label><Input type="number" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} className="h-8 text-xs" /></div>
      </div>
      <div className="space-y-1"><Label className="text-xs text-muted-foreground">Bemerkung</Label><Textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="text-xs" /></div>
      <Button type="submit" className="w-full h-8 text-xs" disabled={saving}>{saving ? 'Speichern' : 'Vorgang anlegen'}</Button>
    </form>
  );
}

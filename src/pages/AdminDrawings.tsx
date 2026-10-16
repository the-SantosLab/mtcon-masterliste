import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { KnowledgeNav } from "@/components/KnowledgeNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Eye, Layers, AlertTriangle, LayoutGrid, List, FileText, Image as ImageIcon, FileBox } from "lucide-react";
import { FulfillmentMetrics } from "@/components/erp/FulfillmentHeader";
import { cn } from "@/lib/utils";
import { isOutdated, paramSummary, revLabel } from "@/lib/drawings";
import "@/components/erp/fulfillment.css";

export type Category = { id: string; parent_id: string | null; code: string; name: string };
type Drawing = { id: string; drawing_no: string; title: string | null; current_version: number; current_version_id: string | null; category_id: string | null; subcategory_id: string | null; part_name: string | null; manufacturer: string | null; updated_at: string };
type Param = { drawing_id: string; name: string; value: string | null; sort_order: number };

const db = supabase as any;
const NONE = '__none';

export default function AdminDrawings() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'drawings';
  const navigate = useNavigate();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [paramsBy, setParamsBy] = useState<Map<string, Param[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [sortDesc, setSortDesc] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<'grid' | 'table'>(() => (localStorage.getItem('drawings-view') as any) || 'grid');
  const [thumbs, setThumbs] = useState<Map<string, { url: string | null; name: string; mime: string | null }>>(new Map());
  useEffect(() => { localStorage.setItem('drawings-view', view); }, [view]);

  const load = async () => {
    setLoading(true);
    const [d, c, p] = await Promise.all([
      db.from('drawings').select('id, drawing_no, title, current_version, current_version_id, category_id, subcategory_id, part_name, manufacturer, updated_at').limit(2000),
      db.from('drawing_categories').select('*').order('code'),
      db.from('drawing_parameters').select('drawing_id, name, value, sort_order').order('sort_order').limit(10000),
    ]);
    setDrawings(d.data ?? []); setCats(c.data ?? []);
    const m = new Map<string, Param[]>(); (p.data ?? []).forEach((x: Param) => m.set(x.drawing_id, [...(m.get(x.drawing_id) ?? []), x])); setParamsBy(m);
    setLoading(false);
    const ids = (d.data ?? []).map((x: Drawing) => x.current_version_id).filter(Boolean);
    if (!ids.length) return;
    const { data: vs } = await db.from('drawing_versions').select('id, drawing_id, storage_path, file_name, mime_type').in('id', ids);
    const imgs = (vs ?? []).filter((v: any) => /^image\//.test(v.mime_type ?? '') || /\.(png|jpe?g|webp|gif|svg)$/i.test(v.file_name));
    const signed = imgs.length ? (await supabase.storage.from('drawings').createSignedUrls(imgs.map((v: any) => v.storage_path), 1800)).data ?? [] : [];
    const urlBy = new Map(signed.map((x: any) => [x.path, x.signedUrl]));
    setThumbs(new Map((vs ?? []).map((v: any) => [v.drawing_id, { url: (urlBy.get(v.storage_path) as string) ?? null, name: v.file_name, mime: v.mime_type }])));
  };
  useEffect(() => { void load(); }, []);

  const catName = (id: string | null) => { const c = cats.find(x => x.id === id); return c ? c.name : '—'; };
  const rows = useMemo(() => drawings.filter(d => {
    if (cat !== 'all' && d.category_id !== cat) return false;
    const q = search.trim().toLowerCase();
    return !q || [d.drawing_no, d.title, d.part_name, d.manufacturer, paramSummary(paramsBy.get(d.id) ?? [], 99)].some(v => (v ?? '').toLowerCase().includes(q));
  }).sort((a, b) => sortDesc ? b.drawing_no.localeCompare(a.drawing_no, 'de', { numeric: true }) : a.drawing_no.localeCompare(b.drawing_no, 'de', { numeric: true })), [drawings, cat, search, sortDesc, paramsBy]);

  return (
    <AppLayout>
      <div className="fulfillment-page">
        <KnowledgeNav />
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-foreground">Zeichnungen</h1>
            <p className="mt-2 text-xs text-muted-foreground">Zeichnungsablage mit Kategorien, Parametern, Revisionen, Dateien und Sets.</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Neue Zeichnung</Button>
        </header>

        <Tabs value={tab} onValueChange={v => setParams({ tab: v })}>
          <TabsList>
            <TabsTrigger value="drawings">Zeichnungen</TabsTrigger>
            <TabsTrigger value="sets">Sets</TabsTrigger>
            <TabsTrigger value="categories">Kategorien</TabsTrigger>
          </TabsList>

          <TabsContent value="drawings" className="space-y-4">
            <FulfillmentMetrics metrics={[
              { label: 'Zeichnungen', value: drawings.length },
              { label: 'Mit Zeichnungsdatei', value: drawings.filter(x => x.current_version > 0).length, tone: 'done' },
              { label: 'Ohne Datei', value: drawings.filter(x => !x.current_version).length, tone: drawings.some(x => !x.current_version) ? 'overdue' : undefined },
              { label: 'Ohne Kategorie', value: drawings.filter(x => !x.category_id).length, tone: drawings.some(x => !x.category_id) ? 'working' : undefined },
            ]} />
            {cats.some(c => !c.parent_id) && <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[{ id: 'all', name: 'Alle', code: '' }, ...cats.filter(c => !c.parent_id)].map(c => <button key={c.id} onClick={() => setCat(c.id)} className={cn('shrink-0 rounded-full border px-3 py-1 text-xs transition-colors', cat === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                {c.name}<span className="ml-1.5 tabular-nums opacity-70">{c.id === 'all' ? drawings.length : drawings.filter(x => x.category_id === c.id).length}</span></button>)}
            </div>}
            <div className="fulfillment-toolbar">
              <Input placeholder="Nummer, Name, Parameter suchen…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-8 text-xs" />
              <Select value={cat} onValueChange={setCat}>
                <SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Alle Kategorien</SelectItem>{cats.filter(c => !c.parent_id).map(c => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}</SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{rows.length} Zeichnungen</span>
              <div className="ml-auto flex rounded-md border border-border p-0.5">
                <Button size="sm" variant={view === 'grid' ? 'secondary' : 'ghost'} className="h-7 px-2" onClick={() => setView('grid')} aria-label="Kachelansicht"><LayoutGrid className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant={view === 'table' ? 'secondary' : 'ghost'} className="h-7 px-2" onClick={() => setView('table')} aria-label="Tabellenansicht"><List className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {view === 'grid' ? (loading ? <p className="py-10 text-center text-sm text-muted-foreground">Lade…</p>
            : rows.length === 0 ? <div className="py-16 text-center border border-dashed border-border rounded-lg"><FileBox className="h-8 w-8 mx-auto text-muted-foreground mb-2" /><p className="text-sm">Keine Zeichnungen</p><Button size="sm" variant="outline" className="mt-3" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />Neue Zeichnung</Button></div>
            : <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {rows.map(d => { const t = thumbs.get(d.id); const ps = paramsBy.get(d.id) ?? []; return (
                <Link key={d.id} to={`/zeichnungen/${d.id}`} className="group overflow-hidden rounded-lg border border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <div className="relative aspect-[4/3] bg-muted/40 flex items-center justify-center overflow-hidden border-b border-border">
                    {t?.url ? <img src={t.url} alt={`Vorschau ${d.drawing_no}`} loading="lazy" className="h-full w-full object-contain bg-background p-2 transition-transform group-hover:scale-[1.03]" />
                    : <div className="flex flex-col items-center gap-2 text-muted-foreground">{t ? <FileText className="h-10 w-10" /> : <ImageIcon className="h-10 w-10 opacity-40" />}<span className="text-[11px]">{t ? (t.name.split('.').pop() ?? '').toUpperCase() : 'Noch keine Datei'}</span></div>}
                    <Badge variant="secondary" className="absolute right-2 top-2 font-mono text-[10px]">Rev. {d.current_version ? revLabel(d.current_version) : '–'}</Badge>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="font-mono text-xs text-primary">{d.drawing_no}</div>
                    <div className="text-sm font-medium text-foreground line-clamp-1">{d.title || d.part_name || 'Ohne Name'}</div>
                    <div className="flex flex-wrap gap-1">{d.category_id && <Badge variant="outline" className="text-[10px]">{catName(d.category_id)}</Badge>}{d.subcategory_id && <Badge variant="outline" className="text-[10px] text-muted-foreground">{catName(d.subcategory_id)}</Badge>}</div>
                    {(d.manufacturer || ps.length > 0) && <p className="text-[11px] text-muted-foreground line-clamp-2">{[d.manufacturer && `Hersteller: ${d.manufacturer}`, paramSummary(ps, 2)].filter(Boolean).join(' · ')}</p>}
                  </div>
                </Link>); })}
            </div>) : <div className="fulfillment-table">
              <table className="w-full text-sm">
                <thead><tr className="text-xs">
                  <th className="text-left p-3"><button onClick={() => setSortDesc(!sortDesc)}>Nummer {sortDesc ? '↑' : '↓'}</button></th>
                  <th className="text-left p-3">Kategorie</th><th className="text-left p-3">Unterkategorie</th>
                  <th className="text-left p-3">Name</th><th className="text-left p-3">Parameter</th><th className="p-3" />
                </tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
                  : rows.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Keine Zeichnungen</td></tr>
                  : rows.map(d => (
                    <tr key={d.id} onClick={() => navigate(`/zeichnungen/${d.id}`)} className="border-t border-border cursor-pointer">
                      <td className="p-3 font-mono text-xs whitespace-nowrap">{d.drawing_no}<div className="text-muted-foreground">Rev. {revLabel(d.current_version)}</div></td>
                      <td className="p-3 text-xs">{catName(d.category_id)}</td>
                      <td className="p-3 text-xs">{catName(d.subcategory_id)}</td>
                      <td className="p-3">{d.title || d.part_name || '—'}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-md">{[d.manufacturer && `Hersteller: ${d.manufacturer}`, paramSummary(paramsBy.get(d.id) ?? [])].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="p-3 text-right"><Button size="icon" variant="ghost" asChild><Link to={`/zeichnungen/${d.id}`} aria-label="Öffnen" onClick={e => e.stopPropagation()}><Eye className="h-4 w-4" /></Link></Button></td>
                    </tr>))}
                </tbody>
              </table>
            </div>}
          </TabsContent>

          <TabsContent value="sets"><SetsTab drawings={drawings} /></TabsContent>
          <TabsContent value="categories"><CategoriesTab cats={cats} onChange={load} /></TabsContent>
        </Tabs>

        <CreateDrawingDialog open={createOpen} cats={cats} onClose={() => setCreateOpen(false)} onCreated={id => navigate(`/zeichnungen/${id}`)} />
      </div>
    </AppLayout>
  );
}

export function CategorySelects({ cats, category, sub, onChange }: { cats: Category[]; category: string | null; sub: string | null; onChange: (c: string | null, s: string | null) => void }) {
  const subs = cats.filter(c => c.parent_id && c.parent_id === category);
  return <div className="grid grid-cols-2 gap-3">
    <div><Label className="text-xs">Kategorie</Label>
      <Select value={category ?? NONE} onValueChange={v => onChange(v === NONE ? null : v, null)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={NONE}>—</SelectItem>{cats.filter(c => !c.parent_id).map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}</SelectContent>
      </Select></div>
    <div><Label className="text-xs">Unterkategorie</Label>
      <Select value={sub ?? NONE} onValueChange={v => onChange(category, v === NONE ? null : v)} disabled={!category}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={NONE}>—</SelectItem>{subs.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}</SelectContent>
      </Select></div>
  </div>;
}

function CreateDrawingDialog({ open, cats, onClose, onCreated }: { open: boolean; cats: Category[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ drawing_no: '', title: '', category_id: null as string | null, subcategory_id: null as string | null, manufacturer: '', part_name: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ drawing_no: '', title: '', category_id: null, subcategory_id: null, manufacturer: '', part_name: '' }); }, [open]);
  const create = async () => {
    if (!f.drawing_no.trim()) return toast.error('Nummer fehlt');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await db.from('drawings').insert({ ...f, drawing_no: f.drawing_no.trim(), title: f.title || null, manufacturer: f.manufacturer || null, part_name: f.part_name || null, created_by: user?.id ?? null }).select('id').single();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Zeichnung angelegt'); onCreated(data.id);
  };
  return <Dialog open={open} onOpenChange={o => !o && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Neue Zeichnung</DialogTitle><DialogDescription>Zeichnungsdatei, Parameter und Dateien ergänzt du danach auf der Detailseite.</DialogDescription></DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Nummer</Label><Input value={f.drawing_no} onChange={e => setF({ ...f, drawing_no: e.target.value })} placeholder="z. B. 00.00.0001" /></div>
          <div><Label className="text-xs">Name</Label><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <CategorySelects cats={cats} category={f.category_id} sub={f.subcategory_id} onChange={(c, s) => setF({ ...f, category_id: c, subcategory_id: s })} />
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Hersteller</Label><Input value={f.manufacturer} onChange={e => setF({ ...f, manufacturer: e.target.value })} /></div>
          <div><Label className="text-xs">Teilename</Label><Input value={f.part_name} onChange={e => setF({ ...f, part_name: e.target.value })} /></div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Abbrechen</Button><Button onClick={create} disabled={busy}>Anlegen</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function CategoriesTab({ cats, onChange }: { cats: Category[]; onChange: () => void }) {
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [parent, setParent] = useState(NONE);
  const add = async () => {
    if (!code.trim() || !name.trim()) return toast.error('Code und Name angeben');
    const { error } = await db.from('drawing_categories').insert({ code: code.trim(), name: name.trim(), parent_id: parent === NONE ? null : parent });
    if (error) return toast.error(error.message);
    setCode(''); setName(''); onChange();
  };
  const del = async (id: string) => { if (!confirm('Kategorie löschen? Zeichnungen behalten ihre Daten, verlieren aber die Zuordnung.')) return; const { error } = await db.from('drawing_categories').delete().eq('id', id); if (error) toast.error(error.message); else onChange(); };
  return <div className="space-y-4">
    <div className="fulfillment-toolbar">
      <Select value={parent} onValueChange={setParent}><SelectTrigger className="w-56 h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={NONE}>Neue Hauptkategorie</SelectItem>{cats.filter(c => !c.parent_id).map(c => <SelectItem key={c.id} value={c.id}>Unterkategorie von {c.name}</SelectItem>)}</SelectContent></Select>
      <Input value={code} onChange={e => setCode(e.target.value)} placeholder="Code, z. B. 00" className="w-32 h-8 text-xs" />
      <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name, z. B. Elektro" className="w-56 h-8 text-xs" />
      <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
    </div>
    <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Code</th><th className="text-left p-3">Kategorie</th><th className="text-left p-3">Unterkategorien</th><th /></tr></thead>
      <tbody>{cats.filter(c => !c.parent_id).map(c => <tr key={c.id} className="border-t border-border align-top">
        <td className="p-3 font-mono text-xs">{c.code}</td><td className="p-3">{c.name}</td>
        <td className="p-3 text-xs"><div className="flex flex-wrap gap-1">{cats.filter(s => s.parent_id === c.id).map(s => <Badge key={s.id} variant="outline" className="gap-1">{s.code} · {s.name}<button aria-label="Löschen" onClick={() => del(s.id)}><Trash2 className="h-3 w-3" /></button></Badge>)}</div></td>
        <td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => del(c.id)} aria-label="Löschen"><Trash2 className="h-4 w-4" /></Button></td>
      </tr>)}{cats.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">Noch keine Kategorien.</td></tr>}</tbody></table></div>
  </div>;
}

type SetRow = { id: string; set_no: string; title: string | null; note: string | null };
type SetItem = { id: string; set_id: string; drawing_id: string; pinned_version: number | null; quantity: number };

function SetsTab({ drawings }: { drawings: Drawing[] }) {
  const [sets, setSets] = useState<SetRow[]>([]);
  const [items, setItems] = useState<SetItem[]>([]);
  const [sel, setSel] = useState<SetRow | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [f, setF] = useState({ set_no: '', title: '', note: '' });
  const [addId, setAddId] = useState(''); const [qty, setQty] = useState('1');
  const byId = useMemo(() => new Map(drawings.map(d => [d.id, d])), [drawings]);
  const load = async () => {
    const [s, i] = await Promise.all([db.from('drawing_sets').select('*').order('set_no'), db.from('drawing_set_items').select('*').limit(10000)]);
    setSets(s.data ?? []); setItems(i.data ?? []);
  };
  useEffect(() => { void load(); }, []);
  const outdated = (setId: string) => items.filter(i => i.set_id === setId && isOutdated(i.pinned_version, byId.get(i.drawing_id)?.current_version ?? 0));

  const createSet = async () => {
    if (!f.set_no.trim()) return toast.error('Set-Nummer fehlt');
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('drawing_sets').insert({ set_no: f.set_no.trim(), title: f.title || null, note: f.note || null, created_by: user?.id ?? null });
    if (error) return toast.error(error.code === '23505' ? 'Set-Nummer existiert bereits' : error.message);
    setNewOpen(false); setF({ set_no: '', title: '', note: '' }); void load();
  };
  const addItem = async () => {
    if (!sel || !addId) return;
    const d = byId.get(addId);
    const { error } = await db.from('drawing_set_items').insert({ set_id: sel.id, drawing_id: addId, quantity: Number(qty) || 1, pinned_version: d?.current_version || null });
    if (error) return toast.error(error.code === '23505' ? 'Bereits im Set' : error.message);
    setAddId(''); setQty('1'); void load();
  };
  const updatePin = async (i: SetItem) => { const cur = byId.get(i.drawing_id)?.current_version ?? null; await db.from('drawing_set_items').update({ pinned_version: cur }).eq('id', i.id); void load(); };
  const removeItem = async (id: string) => { await db.from('drawing_set_items').delete().eq('id', id); void load(); };
  const delSet = async (s: SetRow) => { if (!confirm(`Set ${s.set_no} löschen?`)) return; await db.from('drawing_sets').delete().eq('id', s.id); setSel(null); void load(); };

  return <div className="space-y-4">
    <div className="fulfillment-toolbar"><Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" />Neues Set</Button><span className="text-xs text-muted-foreground">Ein Set bündelt mehrere Zeichnungen zu einer Baugruppe und merkt sich die verwendete Revision.</span></div>
    <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Set-Nr.</th><th className="text-left p-3">Name</th><th className="text-right p-3">Zeichnungen</th><th className="text-left p-3">Revisionen</th></tr></thead>
      <tbody>{sets.map(s => { const o = outdated(s.id).length; return <tr key={s.id} className="border-t border-border cursor-pointer" onClick={() => setSel(s)}>
        <td className="p-3 font-mono text-xs">{s.set_no}</td><td className="p-3">{s.title || '—'}</td>
        <td className="p-3 text-right tabular-nums">{items.filter(i => i.set_id === s.id).length}</td>
        <td className="p-3 text-xs">{o ? <span className="text-status-overdue inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{o} veraltet</span> : <span className="text-status-done">aktuell</span>}</td>
      </tr>; })}{sets.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground text-xs">Noch keine Sets.</td></tr>}</tbody></table></div>

    <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Neues Set</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label className="text-xs">Set-Nummer</Label><Input value={f.set_no} onChange={e => setF({ ...f, set_no: e.target.value })} /></div>
        <div><Label className="text-xs">Name</Label><Input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div><Label className="text-xs">Notiz</Label><Textarea rows={2} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setNewOpen(false)}>Abbrechen</Button><Button onClick={createSet}>Anlegen</Button></DialogFooter>
    </DialogContent></Dialog>

    <Dialog open={!!sel} onOpenChange={o => !o && setSel(null)}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /><span className="font-mono">{sel?.set_no}</span><span className="text-sm text-muted-foreground">{sel?.title}</span></DialogTitle>{sel?.note && <DialogDescription>{sel.note}</DialogDescription>}</DialogHeader>
      {sel && <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px]"><Label className="text-xs">Zeichnung hinzufügen</Label>
            <Select value={addId} onValueChange={setAddId}><SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Zeichnung wählen" /></SelectTrigger>
              <SelectContent>{drawings.filter(d => !items.some(i => i.set_id === sel.id && i.drawing_id === d.id)).map(d => <SelectItem key={d.id} value={d.id}>{d.drawing_no} · {d.title || d.part_name || ''}</SelectItem>)}</SelectContent></Select></div>
          <div className="w-24"><Label className="text-xs">Menge</Label><Input type="number" value={qty} onChange={e => setQty(e.target.value)} className="h-8 text-xs" /></div>
          <Button size="sm" onClick={addItem} disabled={!addId}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button>
        </div>
        <table className="w-full text-xs"><thead className="text-muted-foreground border-b border-border"><tr><th className="text-left py-2">Zeichnung</th><th className="text-right">Menge</th><th className="text-left pl-3">Revision im Set</th><th /></tr></thead>
          <tbody>{items.filter(i => i.set_id === sel.id).map(i => { const d = byId.get(i.drawing_id); const old = isOutdated(i.pinned_version, d?.current_version ?? 0); return <tr key={i.id} className="border-b border-border">
            <td className="py-2"><Link to={`/zeichnungen/${i.drawing_id}`} className="font-mono hover:text-primary">{d?.drawing_no}</Link> <span className="text-muted-foreground">{d?.title}</span></td>
            <td className="text-right tabular-nums">{i.quantity}</td>
            <td className="pl-3">Rev. {revLabel(i.pinned_version)}{old && <span className="text-status-overdue ml-2">aktuell Rev. {revLabel(d?.current_version)}</span>}</td>
            <td className="text-right">{old && <Button size="sm" variant="ghost" onClick={() => updatePin(i)}>Auf aktuelle Revision setzen</Button>}<Button size="icon" variant="ghost" onClick={() => removeItem(i.id)} aria-label="Entfernen"><Trash2 className="h-3.5 w-3.5" /></Button></td>
          </tr>; })}</tbody></table>
      </div>}
      <DialogFooter>{sel && <Button variant="ghost" className="text-destructive mr-auto" onClick={() => delSet(sel)}>Set löschen</Button>}<Button variant="outline" onClick={() => setSel(null)}>Schließen</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

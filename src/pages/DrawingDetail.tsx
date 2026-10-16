import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { KnowledgeNav } from "@/components/KnowledgeNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Upload, Download, Trash2, Plus, Save, FileText } from "lucide-react";
import { CategorySelects, type Category } from "./AdminDrawings";
import { isOutdated, isPreviewable, revLabel } from "@/lib/drawings";
import "@/components/erp/fulfillment.css";

const db = supabase as any;
type Version = { id: string; version: number; status: string; storage_path: string; file_name: string; mime_type: string | null; size_bytes: number | null; change_note: string | null; uploaded_at: string };
const STATUS: Record<string, string> = { draft: 'Entwurf', released: 'Aktuell', superseded: 'Überholt', archived: 'Archiviert' };

export default function DrawingDetail() {
  const { id } = useParams();
  const [d, setD] = useState<any>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [params, setParams] = useState<any[]>([]);
  const [sets, setSets] = useState<any[]>([]);
  const [articles, setArticles] = useState<{ art_nr: string; bezeich_1: string | null }[]>([]);
  const [rev, setRev] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string | null; name: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<any>({});
  const [artSearch, setArtSearch] = useState('');

  const load = async () => {
    const [a, c, v, f, p, s] = await Promise.all([
      db.from('drawings').select('*').eq('id', id).single(),
      db.from('drawing_categories').select('*').order('code'),
      db.from('drawing_versions').select('*').eq('drawing_id', id).order('version', { ascending: false }),
      db.from('drawing_files').select('*').eq('drawing_id', id).order('uploaded_at', { ascending: false }),
      db.from('drawing_parameters').select('*').eq('drawing_id', id).order('sort_order'),
      db.from('drawing_set_items').select('id, quantity, pinned_version, drawing_sets(id, set_no, title)').eq('drawing_id', id),
    ]);
    setD(a.data); setForm(a.data ?? {}); setCats(c.data ?? []); setVersions(v.data ?? []); setFiles(f.data ?? []); setParams(p.data ?? []); setSets(s.data ?? []);
    setRev(r => r ?? (v.data?.[0]?.version ?? null));
  };
  useEffect(() => { setRev(null); void load(); }, [id]);

  useEffect(() => {
    if (!artSearch.trim()) { setArticles([]); return; }
    const t = setTimeout(async () => {
      const q = artSearch.trim().replace(/[%,]/g, '');
      const { data } = await db.from('articles').select('art_nr, bezeich_1').or(`art_nr.ilike.%${q}%,bezeich_1.ilike.%${q}%`).limit(10);
      setArticles(data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [artSearch]);

  const current = useMemo(() => versions.find(v => v.version === rev) ?? null, [versions, rev]);
  useEffect(() => {
    let url: string | null = null; let cancelled = false;
    setPreview(null);
    if (!current || !isPreviewable(current.mime_type, current.file_name)) return;
    (async () => {
      const { data } = await supabase.storage.from('drawings').download(current.storage_path);
      if (!data || cancelled) return;
      url = URL.createObjectURL(data);
      setPreview({ url, mime: current.mime_type || data.type, name: current.file_name });
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [current?.id]);

  const catName = (cid: string | null) => { const c = cats.find(x => x.id === cid); return c ? `${c.name} (${c.code})` : '—'; };
  const signed = async (path: string) => { const { data, error } = await supabase.storage.from('drawings').createSignedUrl(path, 300); if (error) return toast.error(error.message); window.open(data.signedUrl, '_blank'); };

  const save = async () => {
    const { error } = await db.from('drawings').update({
      drawing_no: form.drawing_no, title: form.title || null, category_id: form.category_id, subcategory_id: form.subcategory_id,
      manufacturer: form.manufacturer || null, part_name: form.part_name || null, price: form.price === '' || form.price == null ? null : Number(form.price),
      price_note: form.price_note || null, note: form.note || null, article_art_nr: form.article_art_nr || null,
    }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Gespeichert'); setEdit(false); void load();
  };

  const uploadRevision = async (file: File, note: string) => {
    const next = (d?.current_version ?? 0) + 1;
    const path = `${id}/v${next}-${Date.now()}.${file.name.split('.').pop() || 'bin'}`;
    const up = await supabase.storage.from('drawings').upload(path, file, { contentType: file.type });
    if (up.error) return toast.error(up.error.message);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('drawing_versions').insert({ drawing_id: id, version: next, status: 'released', storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, change_note: note || null, uploaded_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success(`Rev. ${revLabel(next)} hochgeladen`); setRev(next); void load();
  };
  const uploadFile = async (file: File) => {
    const path = `${id}/files/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    const up = await supabase.storage.from('drawings').upload(path, file, { contentType: file.type });
    if (up.error) return toast.error(up.error.message);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await db.from('drawing_files').insert({ drawing_id: id, storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success('Datei abgelegt'); void load();
  };
  const delFile = async (f: any) => { if (!confirm(`${f.file_name} entfernen?`)) return; await db.from('drawing_files').delete().eq('id', f.id); void load(); };

  const [pName, setPName] = useState(''); const [pVal, setPVal] = useState('');
  const addParam = async () => { if (!pName.trim()) return; const { error } = await db.from('drawing_parameters').insert({ drawing_id: id, name: pName.trim(), value: pVal || null, sort_order: params.length }); if (error) return toast.error(error.message); setPName(''); setPVal(''); void load(); };
  const delParam = async (pid: string) => { await db.from('drawing_parameters').delete().eq('id', pid); void load(); };

  const [revFile, setRevFile] = useState<File | null>(null); const [revNote, setRevNote] = useState('');

  if (!d) return <AppLayout><div className="fulfillment-page"><KnowledgeNav /><p className="text-sm text-muted-foreground py-10 text-center">Lade…</p></div></AppLayout>;

  const field = (label: string, value: React.ReactNode) => <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-border text-sm"><span className="text-muted-foreground">{label}</span><span className="text-foreground break-words">{value || '—'}</span></div>;
  const inp = (k: string, label: string, type = 'text') => <div><Label className="text-xs">{label}</Label><Input type={type} value={form[k] ?? ''} onChange={e => setForm({ ...form, [k]: e.target.value })} /></div>;

  return <AppLayout>
    <div className="fulfillment-page">
      <KnowledgeNav />
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/zeichnungen"><ArrowLeft className="h-4 w-4 mr-1" />Alle Zeichnungen</Link></Button>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-4">
          <div>
            <h1 className="text-3xl font-medium text-foreground">{d.title || d.part_name || 'Ohne Name'}</h1>
            <p className="text-xl font-mono text-primary mt-1">{d.drawing_no}</p>
          </div>
          {!edit ? <>
            <Button size="sm" variant="outline" onClick={() => setEdit(true)}><Pencil className="h-4 w-4 mr-1" />Bearbeiten</Button>
            <div>
              <div className="grid grid-cols-[160px_1fr] gap-3 py-2 border-b border-border text-sm items-center"><span className="text-muted-foreground">Revision</span>
                {versions.length ? <Select value={String(rev ?? '')} onValueChange={v => setRev(Number(v))}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger><SelectContent>{versions.map(v => <SelectItem key={v.id} value={String(v.version)}>Rev. {revLabel(v.version)}</SelectItem>)}</SelectContent></Select> : <span>— (noch keine Datei)</span>}</div>
              {field('Kategorie', catName(d.category_id))}
              {field('Unterkategorie', catName(d.subcategory_id))}
              {field('Hersteller', d.manufacturer)}
              {field('Preis', d.price != null ? `${Number(d.price).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €${d.price_note ? ` · ${d.price_note}` : ''}` : d.price_note)}
              {field('Teilename', d.part_name)}
              {field('Artikel', d.article_art_nr && <Link to={`/admin/articles?q=${encodeURIComponent(d.article_art_nr)}`} className="font-mono hover:text-primary">{d.article_art_nr}</Link>)}
              {field('Notiz', d.note && <span className="whitespace-pre-wrap">{d.note}</span>)}
            </div>
          </> : <div className="space-y-3 border border-border rounded-md p-4">
            <div className="grid grid-cols-2 gap-3">{inp('drawing_no', 'Nummer')}{inp('title', 'Name')}</div>
            <CategorySelects cats={cats} category={form.category_id ?? null} sub={form.subcategory_id ?? null} onChange={(c, s) => setForm({ ...form, category_id: c, subcategory_id: s })} />
            <div className="grid grid-cols-2 gap-3">{inp('manufacturer', 'Hersteller')}{inp('part_name', 'Teilename')}{inp('price', 'Preis (€)', 'number')}{inp('price_note', 'Preis-Hinweis, z. B. netto / Währung')}</div>
            <div><Label className="text-xs">Artikel verknüpfen</Label>
              <Input value={artSearch || form.article_art_nr || ''} onChange={e => { setArtSearch(e.target.value); setForm({ ...form, article_art_nr: e.target.value }); }} placeholder="Artikelnummer oder Bezeichnung" />
              {articles.length > 0 && <div className="border border-border rounded mt-1 divide-y divide-border">{articles.map(a => <button key={a.art_nr} type="button" className="block w-full text-left px-2 py-1.5 text-xs hover:bg-muted" onClick={() => { setForm({ ...form, article_art_nr: a.art_nr }); setArtSearch(''); setArticles([]); }}><span className="font-mono">{a.art_nr}</span> · {a.bezeich_1}</button>)}</div>}
            </div>
            <div><Label className="text-xs">Notiz</Label><Textarea rows={3} value={form.note ?? ''} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            <div className="flex gap-2"><Button size="sm" onClick={save}><Save className="h-4 w-4 mr-1" />Speichern</Button><Button size="sm" variant="outline" onClick={() => { setEdit(false); setForm(d); }}>Abbrechen</Button></div>
          </div>}
        </section>

        <section className="border border-border rounded-md bg-muted/20 p-3 min-h-[360px] flex flex-col">
          <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
            <span>{current ? `${current.file_name} · Rev. ${revLabel(current.version)}` : 'Keine Zeichnungsdatei'}</span>
            {current && <Button size="sm" variant="ghost" onClick={() => signed(current.storage_path)}><Download className="h-3.5 w-3.5 mr-1" />Öffnen</Button>}
          </div>
          <div className="flex-1 flex items-center justify-center bg-background rounded">
            {preview ? (preview.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(preview.name)
              ? <img src={preview.url} alt={`Zeichnung ${d.drawing_no}`} className="max-h-[560px] w-full object-contain" />
              : <iframe src={preview.url} title={`Zeichnung ${d.drawing_no}`} className="w-full h-[560px] rounded" />)
            : <div className="text-center text-xs text-muted-foreground p-8"><FileText className="h-8 w-8 mx-auto mb-2" />{current ? 'Für dieses Dateiformat gibt es keine Vorschau.' : 'Lade unter „Revisionshistorie“ die erste Zeichnungsdatei hoch (PDF oder Bild).'}</div>}
          </div>
        </section>
      </div>

      <Tabs defaultValue="sets">
        <TabsList>
          <TabsTrigger value="sets">Zugehörige Sets</TabsTrigger>
          <TabsTrigger value="params">Parameter</TabsTrigger>
          <TabsTrigger value="files">Dateien</TabsTrigger>
          <TabsTrigger value="history">Revisionshistorie</TabsTrigger>
        </TabsList>

        <TabsContent value="sets" className="space-y-3">
          {sets.length === 0 ? <p className="text-xs text-muted-foreground py-6 text-center border border-border rounded">Keine Sets. Sets legst du in der Zeichnungsliste unter „Sets“ an.</p> :
          <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Set</th><th className="text-right p-3">Menge</th><th className="text-left p-3">Revision im Set</th></tr></thead>
            <tbody>{sets.map(s => <tr key={s.id} className="border-t border-border"><td className="p-3"><Link to="/zeichnungen?tab=sets" className="font-mono hover:text-primary">{s.drawing_sets?.set_no}</Link> <span className="text-muted-foreground">{s.drawing_sets?.title}</span></td><td className="p-3 text-right tabular-nums">{s.quantity}</td>
              <td className="p-3 text-xs">Rev. {revLabel(s.pinned_version)}{isOutdated(s.pinned_version, d.current_version) && <Badge variant="outline" className="ml-2 text-status-overdue">veraltete Revision</Badge>}</td></tr>)}</tbody></table></div>}
        </TabsContent>

        <TabsContent value="params" className="space-y-3">
          <div className="fulfillment-toolbar"><Input value={pName} onChange={e => setPName(e.target.value)} placeholder="Name, z. B. Bestellnummer" className="w-56 h-8 text-xs" /><Input value={pVal} onChange={e => setPVal(e.target.value)} placeholder="Wert" className="w-72 h-8 text-xs" onKeyDown={e => e.key === 'Enter' && addParam()} /><Button size="sm" onClick={addParam}><Plus className="h-4 w-4 mr-1" />Hinzufügen</Button></div>
          <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Parameter</th><th className="text-left p-3">Wert</th><th /></tr></thead>
            <tbody>{params.map(p => <tr key={p.id} className="border-t border-border"><td className="p-3">{p.name}</td><td className="p-3">{p.value}</td><td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => delParam(p.id)} aria-label="Entfernen"><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}
              {params.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-xs text-muted-foreground">Keine Parameter.</td></tr>}</tbody></table></div>
        </TabsContent>

        <TabsContent value="files" className="space-y-3">
          <div className="fulfillment-toolbar"><Label className="text-xs">Weitere Datei ablegen (z. B. STEP, DXF, Datenblatt)</Label><Input type="file" className="max-w-xs h-9 text-xs" onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ''; }} /></div>
          <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Datei</th><th className="text-left p-3">Größe</th><th className="text-left p-3">Abgelegt</th><th /></tr></thead>
            <tbody>{files.map(f => <tr key={f.id} className="border-t border-border"><td className="p-3">{f.file_name}</td><td className="p-3 text-xs">{f.size_bytes ? `${Math.round(f.size_bytes / 1024)} KB` : '—'}</td><td className="p-3 text-xs">{new Date(f.uploaded_at).toLocaleString('de-DE')}</td>
              <td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => signed(f.storage_path)} aria-label="Herunterladen"><Download className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => delFile(f)} aria-label="Entfernen"><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}
              {files.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">Keine weiteren Dateien.</td></tr>}</tbody></table></div>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="fulfillment-toolbar border border-border rounded-md p-3">
            <span className="text-xs font-medium">Neue Revision Rev. {revLabel((d.current_version ?? 0) + 1)}</span>
            <Input type="file" className="max-w-xs h-9 text-xs" onChange={e => setRevFile(e.target.files?.[0] ?? null)} />
            <Input value={revNote} onChange={e => setRevNote(e.target.value)} placeholder="Was wurde geändert?" className="w-72 h-8 text-xs" />
            <Button size="sm" disabled={!revFile} onClick={async () => { if (revFile) { await uploadRevision(revFile, revNote); setRevFile(null); setRevNote(''); } }}><Upload className="h-4 w-4 mr-1" />Hochladen</Button>
          </div>
          <div className="fulfillment-table"><table className="w-full text-sm"><thead><tr className="text-xs"><th className="text-left p-3">Revision</th><th className="text-left p-3">Status</th><th className="text-left p-3">Datei</th><th className="text-left p-3">Änderung</th><th className="text-left p-3">Hochgeladen</th><th /></tr></thead>
            <tbody>{versions.map(v => <tr key={v.id} className="border-t border-border"><td className="p-3 font-mono">Rev. {revLabel(v.version)}</td><td className="p-3 text-xs">{STATUS[v.status] ?? v.status}</td><td className="p-3 text-xs">{v.file_name}</td><td className="p-3 text-xs text-muted-foreground">{v.change_note || '—'}</td><td className="p-3 text-xs">{new Date(v.uploaded_at).toLocaleString('de-DE')}</td>
              <td className="p-3 text-right whitespace-nowrap"><Button size="sm" variant="ghost" onClick={() => setRev(v.version)}>Anzeigen</Button><Button size="icon" variant="ghost" onClick={() => signed(v.storage_path)} aria-label="Herunterladen"><Download className="h-3.5 w-3.5" /></Button></td></tr>)}
              {versions.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Noch keine Revision.</td></tr>}</tbody></table></div>
        </TabsContent>
      </Tabs>
    </div>
  </AppLayout>;
}

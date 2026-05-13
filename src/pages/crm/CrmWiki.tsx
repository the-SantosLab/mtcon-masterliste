import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Loader2, Save, History, Trash2, Folder, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Cat = { id: string; name: string; sort_order: number };
type Article = { id: string; category_id: string | null; title: string; body: string; tags: string[]; updated_at: string; updated_by: string | null };
type Version = { id: string; body: string; title: string | null; saved_at: string };

export default function CrmWiki() {
  const { user, role } = useAuth();
  const canWrite = role === 'admin' || role === 'staff';
  const [cats, setCats] = useState<Cat[]>([]);
  const [arts, setArts] = useState<Article[]>([]);
  const [activeCat, setActiveCat] = useState<string | 'all'>('all');
  const [activeArt, setActiveArt] = useState<Article | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ title: string; body: string; tags: string; category_id: string }>({ title: '', body: '', tags: '', category_id: '' });
  const [catDialog, setCatDialog] = useState(false);
  const [catName, setCatName] = useState('');
  const [versions, setVersions] = useState<Version[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('wiki_categories').select('*').order('sort_order').order('name'),
      supabase.from('wiki_articles').select('*').order('updated_at', { ascending: false }),
    ]);
    setCats(c ?? []); setArts(a ?? []);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let list = arts;
    if (activeCat !== 'all') list = list.filter(x => x.category_id === activeCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(x =>
        x.title.toLowerCase().includes(q)
        || x.body.toLowerCase().includes(q)
        || (x.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [arts, activeCat, search]);

  const openArticle = (a: Article) => {
    setActiveArt(a);
    setEditing(false);
    setForm({ title: a.title, body: a.body, tags: (a.tags ?? []).join(', '), category_id: a.category_id ?? '' });
  };

  const newArticle = () => {
    setActiveArt(null);
    setEditing(true);
    setForm({ title: '', body: '', tags: '', category_id: activeCat !== 'all' ? activeCat : (cats[0]?.id ?? '') });
  };

  const saveArticle = async () => {
    if (!form.title.trim()) { toast.error('Titel erforderlich'); return; }
    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (activeArt) {
      const { error } = await supabase.from('wiki_articles').update({
        title: form.title, body: form.body, tags, category_id: form.category_id || null, updated_by: user?.id,
      }).eq('id', activeArt.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Aktualisiert');
    } else {
      const { data, error } = await supabase.from('wiki_articles').insert({
        title: form.title, body: form.body, tags, category_id: form.category_id || null,
        created_by: user?.id, updated_by: user?.id,
      }).select('*').single();
      if (error) { toast.error(error.message); return; }
      setActiveArt(data as Article);
      toast.success('Angelegt');
    }
    setEditing(false);
    void load();
  };

  const deleteArticle = async () => {
    if (!activeArt) return;
    if (!confirm('Artikel wirklich löschen?')) return;
    const { error } = await supabase.from('wiki_articles').delete().eq('id', activeArt.id);
    if (error) { toast.error(error.message); return; }
    setActiveArt(null);
    void load();
  };

  const loadVersions = async () => {
    if (!activeArt) return;
    const { data } = await supabase.from('wiki_versions').select('*').eq('article_id', activeArt.id).order('saved_at', { ascending: false });
    setVersions((data ?? []) as Version[]);
    setShowVersions(true);
  };

  const restoreVersion = async (v: Version) => {
    if (!activeArt) return;
    if (!confirm('Diese Version wiederherstellen? Die aktuelle Version wird in die History verschoben.')) return;
    const { error } = await supabase.from('wiki_articles').update({
      body: v.body, title: v.title ?? activeArt.title, updated_by: user?.id,
    }).eq('id', activeArt.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Wiederhergestellt');
    setShowVersions(false);
    void load();
  };

  const addCategory = async () => {
    if (!catName.trim()) return;
    const { error } = await supabase.from('wiki_categories').insert({ name: catName.trim(), sort_order: cats.length });
    if (error) { toast.error(error.message); return; }
    setCatName(''); setCatDialog(false);
    void load();
  };

  return (
    <CrmLayout>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Wissensdatenbank</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Interner Vertriebs-Wissensspeicher</p>
        </div>
        <div className="flex gap-2">
          {canWrite && <Button size="sm" variant="outline" onClick={() => setCatDialog(true)} className="h-8 text-xs gap-1.5"><Folder className="h-3.5 w-3.5" />Kategorie</Button>}
          {canWrite && <Button size="sm" onClick={newArticle} className="h-8 text-xs gap-1.5"><Plus className="h-3.5 w-3.5" />Artikel</Button>}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-3 rounded-lg border border-border bg-card/40 backdrop-blur-xl p-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Volltextsuche…" className="h-8 text-xs pl-7" />
          </div>
          <div className="space-y-0.5">
            <button onClick={() => setActiveCat('all')} className={cn('w-full text-left px-2 py-1.5 rounded text-xs transition-colors', activeCat === 'all' ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-card')}>
              Alle Artikel ({arts.length})
            </button>
            {cats.map(c => {
              const n = arts.filter(a => a.category_id === c.id).length;
              return (
                <button key={c.id} onClick={() => setActiveCat(c.id)} className={cn('w-full text-left px-2 py-1.5 rounded text-xs transition-colors', activeCat === c.id ? 'bg-primary/15 text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-card')}>
                  {c.name} <span className="text-muted-foreground/60">({n})</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Article list */}
        <div className="col-span-12 md:col-span-3 rounded-lg border border-border bg-card/40 backdrop-blur-xl p-2 max-h-[70vh] overflow-y-auto">
          {loading ? <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
            : filtered.length === 0 ? <p className="text-xs text-muted-foreground p-3">Keine Artikel.</p>
            : filtered.map(a => (
              <button key={a.id} onClick={() => openArticle(a)} className={cn('w-full text-left px-2 py-2 rounded text-xs border-b border-border/40 last:border-0 hover:bg-card', activeArt?.id === a.id && 'bg-primary/10')}>
                <div className="flex items-start gap-1.5">
                  <FileText className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground truncate font-medium">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(a.updated_at).toLocaleDateString('de-DE')}</p>
                  </div>
                </div>
              </button>
            ))
          }
        </div>

        {/* Detail */}
        <section className="col-span-12 md:col-span-6 rounded-lg border border-border bg-card/40 backdrop-blur-xl p-4 min-h-[60vh]">
          {!activeArt && !editing ? (
            <p className="text-xs text-muted-foreground">Wähle einen Artikel oder lege einen neuen an.</p>
          ) : editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Titel</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="h-8 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Kategorie</Label>
                  <Select value={form.category_id || 'none'} onValueChange={v => setForm({ ...form, category_id: v === 'none' ? '' : v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Keine</SelectItem>
                      {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Schlagwörter (kommasepariert)</Label>
                  <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Inhalt (Markdown unterstützt)</Label>
                <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} className="text-xs min-h-[300px] font-mono" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveArticle} className="h-8 text-xs gap-1.5"><Save className="h-3.5 w-3.5" />Speichern</Button>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); if (!activeArt) setActiveArt(null); }} className="h-8 text-xs">Abbrechen</Button>
              </div>
            </div>
          ) : activeArt ? (
            <div>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{activeArt.title}</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {cats.find(c => c.id === activeArt.category_id)?.name ?? '—'} · zuletzt geändert {new Date(activeArt.updated_at).toLocaleString('de-DE')}
                  </p>
                  {activeArt.tags?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {activeArt.tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>)}
                    </div>
                  )}
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={loadVersions} className="h-7 text-[11px] gap-1"><History className="h-3 w-3" />Versionen</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 text-[11px]">Bearbeiten</Button>
                    <Button size="sm" variant="ghost" onClick={deleteArticle} className="h-7 text-[11px] text-destructive"><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
              <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{activeArt.body || <span className="text-muted-foreground italic">Noch kein Inhalt.</span>}</div>
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Neue Kategorie</DialogTitle></DialogHeader>
          <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="z.B. Preispolitik" className="h-8 text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)} size="sm" className="h-8 text-xs">Abbrechen</Button>
            <Button onClick={addCategory} size="sm" className="h-8 text-xs">Anlegen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Versionshistorie</DialogTitle></DialogHeader>
          {versions.length === 0 ? <p className="text-xs text-muted-foreground">Noch keine vorherigen Versionen.</p> : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
              {versions.map(v => (
                <li key={v.id} className="p-3 rounded border border-border bg-card/40">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground">{v.title ?? activeArt?.title}</p>
                      <p className="text-[11px] text-muted-foreground">{new Date(v.saved_at).toLocaleString('de-DE')}</p>
                      <p className="text-[11px] text-foreground mt-2 whitespace-pre-wrap line-clamp-3">{v.body}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => restoreVersion(v)} className="h-7 text-[11px]">Wiederherstellen</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}

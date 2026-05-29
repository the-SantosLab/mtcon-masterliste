import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Megaphone, Plus, Pencil, Trash2, Archive, ArchiveRestore, Eye, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'wichtig' | 'kritisch';
  pinned: boolean;
  published_at: string;
  expires_at: string | null;
  archived_at: string | null;
  created_at: string;
  created_by: string;
}

interface ReceiptRow {
  announcement_id: string;
  user_id: string;
  delivered_at: string | null;
  seen_at: string | null;
  read_at: string | null;
}

interface Profile { id: string; display_name: string; short_code: string }

const emptyForm = () => ({
  id: '' as string | '',
  title: '',
  body: '',
  severity: 'info' as 'info' | 'wichtig' | 'kritisch',
  pinned: false,
  published_at: new Date().toISOString().slice(0, 16),
  expires_at: '' as string,
});

const ANNOUNCEMENT_DRAFT_KEY = 'createAnnouncementDraft:v1';

const loadAnnouncementDraft = () => {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENT_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.title !== undefined) return parsed;
  } catch {}
  return null;
};

export default function AdminAnnouncements() {
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [items, setItems] = useState<Announcement[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [receipts, setReceipts] = useState<Record<string, ReceiptRow[]>>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [announcementDraftRestored, setAnnouncementDraftRestored] = useState(false);
  const [statsOpen, setStatsOpen] = useState<Announcement | null>(null);

  // Auto-save draft (only for new announcements, not edits)
  useEffect(() => {
    if (form.id) return;
    try {
      const hasContent = form.title.trim() || form.body.trim();
      if (hasContent) localStorage.setItem(ANNOUNCEMENT_DRAFT_KEY, JSON.stringify(form));
      else localStorage.removeItem(ANNOUNCEMENT_DRAFT_KEY);
    } catch {}
  }, [form]);

  const discardAnnouncementDraft = () => {
    try { localStorage.removeItem(ANNOUNCEMENT_DRAFT_KEY); } catch {}
    setForm(emptyForm());
    setAnnouncementDraftRestored(false);
  };

  const totalUsers = profiles.length;

  const load = async () => {
    let q = (supabase as any).from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false });
    if (tab === 'active') q = q.is('archived_at', null);
    else q = q.not('archived_at', 'is', null);
    const { data } = await q;
    setItems((data || []) as Announcement[]);
    const ids = (data || []).map((a: Announcement) => a.id);
    if (ids.length) {
      const { data: r } = await (supabase as any).from('announcement_receipts').select('*').in('announcement_id', ids);
      const map: Record<string, ReceiptRow[]> = {};
      (r || []).forEach((x: ReceiptRow) => { (map[x.announcement_id] ||= []).push(x); });
      setReceipts(map);
    } else setReceipts({});
  };

  const loadProfiles = async () => {
    const { data } = await supabase.from('users_profile').select('id, display_name, short_code');
    setProfiles((data || []) as Profile[]);
  };

  useEffect(() => { loadProfiles(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  if (!isAdmin) {
    return <AppLayout><p className="text-sm text-muted-foreground">Kein Zugriff.</p></AppLayout>;
  }

  const openCreate = () => {
    const draft = loadAnnouncementDraft();
    if (draft) {
      setForm({ ...emptyForm(), ...draft, id: '' });
      setAnnouncementDraftRestored(true);
    } else {
      setForm(emptyForm());
      setAnnouncementDraftRestored(false);
    }
    setEditorOpen(true);
  };
  const openEdit = (a: Announcement) => {
    setForm({
      id: a.id,
      title: a.title,
      body: a.body,
      severity: a.severity,
      pinned: a.pinned,
      published_at: a.published_at.slice(0, 16),
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    });
    setAnnouncementDraftRestored(false);
    setEditorOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Titel ist erforderlich'); return; }
    const payload: any = {
      title: form.title.trim(),
      body: form.body,
      severity: form.severity,
      pinned: form.pinned,
      published_at: new Date(form.published_at).toISOString(),
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      updated_by: user?.id,
    };
    if (form.id) {
      const { error } = await (supabase as any).from('announcements').update(payload).eq('id', form.id);
      if (error) { toast.error('Fehler beim Speichern'); return; }
      toast.success('Aktualisiert');
    } else {
      payload.created_by = user?.id;
      const { error } = await (supabase as any).from('announcements').insert(payload);
      if (error) { toast.error('Fehler beim Erstellen'); return; }
      toast.success('Veröffentlicht');
      try { localStorage.removeItem(ANNOUNCEMENT_DRAFT_KEY); } catch {}
      setAnnouncementDraftRestored(false);
    }
    setEditorOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Mitteilung wirklich löschen?')) return;
    const { error } = await (supabase as any).from('announcements').delete().eq('id', id);
    if (error) { toast.error('Fehler beim Löschen'); return; }
    load();
  };

  const archive = async (id: string) => {
    const { error } = await (supabase as any).from('announcements').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error('Fehler beim Archivieren'); return; }
    load();
  };

  const restore = async (id: string) => {
    const { error } = await (supabase as any).from('announcements').update({ archived_at: null }).eq('id', id);
    if (error) { toast.error('Fehler'); return; }
    load();
  };

  const fmt = (s: string | null) => s ? new Date(s).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';

  return (
    <AppLayout>
      <div className="space-y-4 max-w-[1400px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold text-foreground">Mitteilungen</h1>
          </div>
          <Button size="sm" onClick={openCreate}><Plus className="h-3 w-3 mr-1" /> Neue Mitteilung</Button>
        </div>

        <div className="flex items-center gap-1 border-b border-border">
          {(['active', 'archived'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn('px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {t === 'active' ? 'Aktiv' : 'Archiv'}
            </button>
          ))}
        </div>

        <div className="glass-card overflow-hidden">
          {items.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">Keine Mitteilungen.</p>
          ) : (
            <div className="divide-y divide-border">
              {items.map(a => {
                const r = receipts[a.id] || [];
                const delivered = r.filter(x => x.delivered_at).length;
                const seen = r.filter(x => x.seen_at).length;
                const read = r.filter(x => x.read_at).length;
                return (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{a.title}</span>
                          <span className={cn('text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                            a.severity === 'info' && 'bg-blue-500/10 text-blue-500',
                            a.severity === 'wichtig' && 'bg-amber-500/10 text-amber-600',
                            a.severity === 'kritisch' && 'bg-red-500/10 text-red-500',
                          )}>{a.severity}</span>
                          {a.pinned && <span className="text-[10px] uppercase tracking-wider text-primary">Angeheftet</span>}
                        </div>
                        {a.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-2">{a.body}</p>}
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                          <span>Veröffentlicht: {fmt(a.published_at)}</span>
                          {a.expires_at && <span>Läuft ab: {fmt(a.expires_at)}</span>}
                          {a.archived_at && <span>Archiviert: {fmt(a.archived_at)}</span>}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[11px]">
                          <span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="h-3 w-3" /> {totalUsers} Nutzer</span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">Zugestellt: <strong className="text-foreground">{delivered}</strong></span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">Gesehen: <strong className="text-foreground">{seen}</strong></span>
                          <span className="inline-flex items-center gap-1 text-muted-foreground">Gelesen: <strong className="text-foreground">{read}</strong></span>
                          <button onClick={() => setStatsOpen(a)} className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                            <Eye className="h-3 w-3" /> Detail
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(a)}><Pencil className="h-3 w-3" /></Button>
                        {!a.archived_at ? (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => archive(a.id)} title="Archivieren"><Archive className="h-3 w-3" /></Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => restore(a.id)} title="Wiederherstellen"><ArchiveRestore className="h-3 w-3" /></Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(a.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent
          className="max-w-xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-sm">{form.id ? 'Mitteilung bearbeiten' : 'Neue Mitteilung'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {announcementDraftRestored && !form.id && (
              <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px]">
                <span className="text-foreground">Entwurf wiederhergestellt – deine letzten Eingaben wurden geladen.</span>
                <button
                  type="button"
                  onClick={discardAnnouncementDraft}
                  className="text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Entwurf verwerfen
                </button>
              </div>
            )}
            <div>
              <Label className="text-xs">Titel</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Text</Label>
                <MtiqButton
                  text={form.body}
                  onResult={(t) => setForm(f => ({ ...f, body: t }))}
                  minChars={10}
                />
              </div>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} rows={5} className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Priorität</Label>
                <Select value={form.severity} onValueChange={(v: any) => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="wichtig">Wichtig</SelectItem>
                    <SelectItem value="kritisch">Kritisch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Switch checked={form.pinned} onCheckedChange={(v) => setForm(f => ({ ...f, pinned: v }))} />
                <Label className="text-xs">Anheften (kein Auto-Archiv)</Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Veröffentlichen ab</Label>
                <Input type="datetime-local" value={form.published_at} onChange={e => setForm(f => ({ ...f, published_at: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Läuft ab (optional)</Label>
                <Input type="datetime-local" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>Abbrechen</Button>
            <Button onClick={save}>{form.id ? 'Speichern' : 'Veröffentlichen'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Detail */}
      <Dialog open={!!statsOpen} onOpenChange={(o) => !o && setStatsOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Empfangsstatus · {statsOpen?.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-6 py-2">Nutzer</th>
                  <th className="text-left px-3 py-2">Zugestellt</th>
                  <th className="text-left px-3 py-2">Gesehen</th>
                  <th className="text-left px-6 py-2">Gelesen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {profiles.map(p => {
                  const r = (receipts[statsOpen?.id || ''] || []).find(x => x.user_id === p.id);
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-1.5 text-foreground">{p.display_name} <span className="text-muted-foreground">({p.short_code})</span></td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(r?.delivered_at ?? null)}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{fmt(r?.seen_at ?? null)}</td>
                      <td className="px-6 py-1.5 tabular-nums">
                        {r?.read_at ? <span className="inline-flex items-center gap-1 text-foreground"><Check className="h-3 w-3 text-emerald-500" />{fmt(r.read_at)}</span> : <span className="text-muted-foreground">–</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

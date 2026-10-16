import { KnowledgeNav } from '@/components/KnowledgeNav';
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Plus, Upload, Download, History, Archive, FileBox } from "lucide-react";

type Drawing = {
  id: string; case_id: string | null; project_id: string | null;
  drawing_no: string; title: string | null; current_version: number;
  current_version_id: string | null; updated_at: string;
};
type Version = {
  id: string; drawing_id: string; version: number;
  status: 'draft'|'released'|'archived'|'superseded';
  storage_path: string; file_name: string; mime_type: string | null;
  size_bytes: number | null; change_note: string | null;
  uploaded_at: string; uploaded_by: string | null;
};

const STATUS_COLOR: Record<string,string> = {
  draft: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  released: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  superseded: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  archived: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};
const STATUS_LABEL: Record<string,string> = {
  draft: 'Entwurf', released: 'Freigegeben (aktuell)', superseded: 'Überholt', archived: 'Archiviert',
};

export default function AdminDrawings() {
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCase, setFilterCase] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [sel, setSel] = useState<Drawing | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: d }, { data: c }] = await Promise.all([
      (supabase.from('drawings' as any).select('*').order('updated_at', { ascending: false }).limit(500)) as any,
      (supabase.from('cases').select('id, case_no, title').order('created_at', { ascending: false }).limit(500)) as any,
    ]);
    setDrawings((d as Drawing[]) || []); setCases(c || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => drawings.filter(d => {
    if (filterCase !== 'all' && d.case_id !== filterCase) return false;
    if (search && !`${d.drawing_no} ${d.title || ''}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [drawings, filterCase, search]);

  const openDrawing = async (d: Drawing) => {
    setSel(d);
    const { data } = await (supabase.from('drawing_versions' as any).select('*').eq('drawing_id', d.id).order('version', { ascending: false })) as any;
    setVersions((data as Version[]) || []);
  };

  const downloadVersion = async (v: Version) => {
    const { data, error } = await supabase.storage.from('drawings').createSignedUrl(v.storage_path, 300);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, '_blank');
  };

  const archiveVersion = async (v: Version) => {
    if (!confirm('Diese Version archivieren?')) return;
    const { error } = await (supabase.from('drawing_versions' as any).update({ status: 'archived' }).eq('id', v.id)) as any;
    if (error) return toast.error(error.message);
    toast.success('Archiviert');
    if (sel) openDrawing(sel);
  };

  const restoreVersion = async (v: Version) => {
    if (!confirm(`Version ${v.version} wieder als aktuell setzen?`)) return;
    // Insert as a new version with higher number
    if (!sel) return;
    const newVersion = sel.current_version + 1;
    const { error } = await (supabase.from('drawing_versions' as any).insert({
      drawing_id: sel.id, version: newVersion, status: 'released',
      storage_path: v.storage_path, file_name: v.file_name, mime_type: v.mime_type, size_bytes: v.size_bytes,
      change_note: `Rückgriff auf v${v.version}`,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    })) as any;
    if (error) return toast.error(error.message);
    toast.success(`Neue Version v${newVersion} aus v${v.version} erstellt`);
    await load();
    const { data: d } = await (supabase.from('drawings' as any).select('*').eq('id', sel.id).single()) as any;
    if (d) openDrawing(d);
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <KnowledgeNav />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-medium flex items-center gap-2"><FileBox className="h-5 w-5" /> Zeichnungen</h1>
            <p className="text-sm text-muted-foreground mt-1">Master pro Zeichnung mit Versionshistorie. Neue Freigabe setzt alte Versionen automatisch auf „Überholt".</p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> Neue Zeichnung</Button>
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <Input placeholder="Suchen…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-8 text-xs" />
          <Select value={filterCase} onValueChange={setFilterCase}>
            <SelectTrigger className="w-64 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Vorgänge</SelectItem>
              {cases.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.case_no} · {c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Zeichnungs-Nr.</th>
                <th className="text-left p-3 font-medium">Bezeichnung</th>
                <th className="text-left p-3 font-medium">Vorgang</th>
                <th className="text-right p-3 font-medium">Aktuelle Version</th>
                <th className="text-left p-3 font-medium">Aktualisiert</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Lade…</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Keine Zeichnungen</td></tr>
              : filtered.map(d => (
                <tr key={d.id} onClick={() => openDrawing(d)} className="border-t border-border/40 hover:bg-muted/20 cursor-pointer">
                  <td className="p-3 font-mono text-xs">{d.drawing_no}</td>
                  <td className="p-3">{d.title || '—'}</td>
                  <td className="p-3 text-xs text-muted-foreground">{cases.find((c: any) => c.id === d.case_id)?.case_no || '—'}</td>
                  <td className="p-3 text-right font-mono">v{d.current_version}</td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(d.updated_at).toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); load().then(async () => {
          const { data } = await (supabase.from('drawings' as any).select('*').eq('id', id).single()) as any;
          if (data) openDrawing(data);
        }); }} cases={cases} />

        <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="font-mono">{sel?.drawing_no}</span>
                <span className="text-sm text-muted-foreground">— {sel?.title}</span>
              </DialogTitle>
            </DialogHeader>
            {sel && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <History className="h-3 w-3" /> {versions.length} Versionen · Aktuell: <span className="font-mono">v{sel.current_version}</span>
                  </div>
                  <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4 mr-1" /> Neue Version hochladen</Button>
                </div>
                <Card className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                      <tr>
                        <th className="text-left p-2">Version</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Datei</th>
                        <th className="text-left p-2">Änderung</th>
                        <th className="text-left p-2">Hochgeladen</th>
                        <th className="text-right p-2">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map(v => (
                        <tr key={v.id} className="border-t border-border/40">
                          <td className="p-2 font-mono">v{v.version}</td>
                          <td className="p-2"><Badge variant="outline" className={STATUS_COLOR[v.status]}>{STATUS_LABEL[v.status]}</Badge></td>
                          <td className="p-2">{v.file_name}<div className="text-[9px] text-muted-foreground">{v.size_bytes ? `${Math.round(v.size_bytes/1024)} KB` : ''}</div></td>
                          <td className="p-2 text-muted-foreground">{v.change_note || '—'}</td>
                          <td className="p-2 text-muted-foreground">{new Date(v.uploaded_at).toLocaleString('de-DE')}</td>
                          <td className="p-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => downloadVersion(v)}><Download className="h-3 w-3" /></Button>
                            {v.status === 'superseded' && (
                              <Button size="sm" variant="ghost" onClick={() => restoreVersion(v)} title="Wieder als aktuell setzen">↺</Button>
                            )}
                            {v.status !== 'archived' && v.status !== 'released' && (
                              <Button size="sm" variant="ghost" onClick={() => archiveVersion(v)} title="Archivieren"><Archive className="h-3 w-3" /></Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSel(null)}>Schließen</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {sel && (
          <UploadDialog
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            drawing={sel}
            onUploaded={async () => {
              setUploadOpen(false);
              const { data } = await (supabase.from('drawings' as any).select('*').eq('id', sel.id).single()) as any;
              if (data) openDrawing(data);
              load();
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}

function CreateDialog({ open, onClose, onCreated, cases }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; cases: any[] }) {
  const [caseId, setCaseId] = useState('');
  const [drawingNo, setDrawingNo] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setCaseId(''); setDrawingNo(''); setTitle(''); } }, [open]);

  const create = async () => {
    if (!drawingNo) return toast.error('Zeichnungs-Nr. fehlt');
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase.from('drawings' as any).insert({
      case_id: caseId || null, drawing_no: drawingNo, title: title || null, created_by: user?.id ?? null,
    }).select().single()) as any;
    setBusy(false);
    if (error || !data) return toast.error(error?.message || 'Fehler');
    toast.success('Zeichnung angelegt');
    onCreated(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Neue Zeichnung</DialogTitle><DialogDescription>Master anlegen, Versionen folgen nach Upload.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Zeichnungs-Nr.</Label><Input value={drawingNo} onChange={e => setDrawingNo(e.target.value)} placeholder="z. B. ZN-1234" /></div>
          <div><Label className="text-xs">Bezeichnung</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
          <div><Label className="text-xs">Vorgang (optional)</Label>
            <Select value={caseId} onValueChange={setCaseId}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{cases.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.case_no} · {c.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={create} disabled={busy}>{busy ? 'Anlegen…' : 'Anlegen'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ open, onClose, drawing, onUploaded }: { open: boolean; onClose: () => void; drawing: Drawing; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setFile(null); setNote(''); } }, [open]);

  const upload = async () => {
    if (!file) return toast.error('Datei wählen');
    setBusy(true);
    const newVersion = drawing.current_version + 1;
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${drawing.id}/v${newVersion}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('drawings').upload(path, file, { contentType: file.type });
    if (upErr) { setBusy(false); return toast.error(upErr.message); }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from('drawing_versions' as any).insert({
      drawing_id: drawing.id, version: newVersion, status: 'released',
      storage_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      change_note: note || null, uploaded_by: user?.id ?? null,
    })) as any;
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`v${newVersion} freigegeben — vorherige Version archiviert`);
    onUploaded();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Neue Version v{drawing.current_version + 1}</DialogTitle><DialogDescription>Aktuelle Version wird automatisch auf „Überholt" gesetzt.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Datei</Label><Input type="file" onChange={e => setFile(e.target.files?.[0] || null)} /></div>
          <div><Label className="text-xs">Änderungs-Notiz</Label><Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="Was wurde geändert?" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={upload} disabled={busy || !file}>{busy ? 'Lade…' : 'Hochladen + Freigeben'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

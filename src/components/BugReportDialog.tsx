import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bug, Clipboard, Monitor, X, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { collectClientMeta } from '@/lib/clientMeta';
import { sanitizeFileName } from '@/lib/utils';
import { MtiqButton } from '@/components/MtiqButton';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caseId?: string;
  caseNo?: string;
}

const KIND_OPTIONS = [
  { value: 'bug', label: 'Bug / Fehler' },
  { value: 'idee', label: 'Verbesserungsidee' },
  { value: 'frage', label: 'Frage' },
  { value: 'sonstige', label: 'Sonstiges' },
] as const;

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Niedrig' },
  { value: 'medium', label: 'Mittel' },
  { value: 'high', label: 'Hoch' },
  { value: 'critical', label: 'Kritisch (Blocker)' },
] as const;

const DRAFT_KEY = 'bug-report-draft-v1';

const loadDraft = (): { title?: string; description?: string; kind?: any; priority?: any } => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

export function BugReportDialog({ open, onOpenChange, caseId, caseNo }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const initial = loadDraft();
  const [title, setTitle] = useState<string>(initial.title ?? '');
  const [description, setDescription] = useState<string>(initial.description ?? '');
  const [kind, setKind] = useState<'bug' | 'idee' | 'frage' | 'sonstige'>(initial.kind ?? 'bug');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>(initial.priority ?? 'medium');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const dropRef = useRef<HTMLDivElement>(null);

  // Entwurf automatisch zwischenspeichern, damit Eingaben beim versehentlichen Schließen erhalten bleiben
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (title || description || kind !== 'bug' || priority !== 'medium') {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, description, kind, priority }));
        } else {
          localStorage.removeItem(DRAFT_KEY);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [title, description, kind, priority]);

  const reset = () => {
    setTitle(''); setDescription(''); setKind('bug'); setPriority('medium'); setFiles([]);
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const discardDraft = () => {
    if (title || description) {
      if (!window.confirm('Entwurf wirklich verwerfen? Eingaben gehen verloren.')) return;
    }
    reset();
    onOpenChange(false);
  };

  // Thumbnail-URLs für Bilder generieren
  useEffect(() => {
    const map: Record<string, string> = {};
    files.forEach((f, i) => {
      if (f.type.startsWith('image/')) {
        map[`${i}_${f.name}_${f.size}`] = URL.createObjectURL(f);
      }
    });
    setPreviews(map);
    return () => { Object.values(map).forEach(u => URL.revokeObjectURL(u)); };
  }, [files]);

  // Strg+V Screenshot-Einfügen im gesamten Dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs: File[] = [];
      for (const it of items) {
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            const ext = f.type.split('/')[1] || 'png';
            const renamed = new File([f], `screenshot-${Date.now()}.${ext}`, { type: f.type });
            imgs.push(renamed);
          }
        }
      }
      if (imgs.length > 0) {
        e.preventDefault();
        setFiles(prev => [...prev, ...imgs]);
        toast.success(`${imgs.length} Screenshot${imgs.length > 1 ? 's' : ''} hinzugefügt`);
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [open]);

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        toast.error('Zwischenablage-API nicht verfügbar — bitte Strg+V verwenden');
        return;
      }
      const items = await navigator.clipboard.read();
      const imgs: File[] = [];
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          const ext = type.split('/')[1] || 'png';
          imgs.push(new File([blob], `screenshot-${Date.now()}.${ext}`, { type }));
        }
      }
      if (imgs.length === 0) { toast.error('Kein Bild in der Zwischenablage'); return; }
      setFiles(prev => [...prev, ...imgs]);
      toast.success(`${imgs.length} Screenshot${imgs.length > 1 ? 's' : ''} hinzugefügt`);
    } catch (err: any) {
      toast.error('Einfügen fehlgeschlagen: ' + (err.message || 'Unbekannt'));
    }
  };

  const captureScreen = async () => {
    try {
      const md: any = navigator.mediaDevices;
      if (!md?.getDisplayMedia) {
        toast.error('Bildschirmaufnahme im Browser nicht verfügbar');
        return;
      }
      const stream: MediaStream = await md.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      // Kurzes Warten, damit der erste Frame stabil ist
      await new Promise(r => setTimeout(r, 250));
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      const w = video.videoWidth;
      const h = video.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(video, 0, 0, w, h);
      track.stop();
      stream.getTracks().forEach(t => t.stop());
      const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), 'image/png'));
      const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
      setFiles(prev => [...prev, file]);
      toast.success('Screenshot aufgenommen');
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        toast.error('Aufnahme fehlgeschlagen: ' + (err.message || 'Unbekannt'));
      }
    }
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    if (!user?.id) { toast.error('Nicht angemeldet'); return; }
    if (!title.trim() || title.trim().length < 3) { toast.error('Bitte einen aussagekräftigen Titel angeben'); return; }
    if (!description.trim() || description.trim().length < 10) { toast.error('Bitte eine Beschreibung mit mindestens 10 Zeichen angeben'); return; }
    setSubmitting(true);
    try {
      const meta = collectClientMeta(caseId ? { case_id: caseId, case_no: caseNo } : undefined);
      const prefixedDescription = caseNo
        ? `Bezug zu Vorgang ${caseNo}\n\n${description.trim()}`
        : description.trim();

      // Session vor dem Insert absichern – bei abgelaufenem/refreshendem Access-Token
      // wäre auth.uid() = NULL und die RLS-Policy würde greifen.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        await supabase.auth.refreshSession();
      }

      const doInsert = () => supabase
        .from('support_tickets')
        .insert({
          title: title.trim(),
          description: prefixedDescription,
          status: 'open' as any,
          priority: priority as any,
          source: 'intern',
          kind,
          reporter_user_id: user.id,
          case_id: caseId ?? null,
          route: meta.route,
          client_meta: meta,
        } as any)
        .select('id, ticket_number')
        .single();

      let { data: inserted, error } = await doInsert();
      // Bei RLS-/Auth-Fehler einmal Token refreshen und erneut versuchen
      if (error && /row-level security|JWT|permission/i.test(error.message)) {
        await supabase.auth.refreshSession();
        ({ data: inserted, error } = await doInsert());
      }
      if (error) throw error;


      const ticketId = (inserted as any).id as string;
      const ticketNo = (inserted as any).ticket_number as string;

      // Anhänge hochladen
      if (files.length > 0) {
        for (const file of files) {
          const path = `tickets/${ticketId}/${Date.now()}_${sanitizeFileName(file.name)}`;
          const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file);
          if (upErr) console.warn('Upload fehlgeschlagen:', upErr.message);
        }
      }

      // KI-Triage anstoßen (Fehler werden ignoriert, Ticket bleibt bestehen)
      supabase.functions.invoke('analyze-internal-ticket', {
        body: { ticket_id: ticketId },
      }).catch(() => { /* still */ });

      toast.success(`Meldung ${ticketNo} eingereicht`);
      reset();
      onOpenChange(false);
      // Weiterleitung in die eigene Übersicht
      navigate('/feedback');
    } catch (err: any) {
      toast.error('Fehler beim Senden: ' + (err.message || 'Unbekannt'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <Bug className="h-4 w-4 text-primary" />
            Bug / Feedback melden
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {caseNo
              ? `Meldung mit Bezug zu Vorgang ${caseNo}. Browser, Pfad und letzte Konsolenfehler werden automatisch mitgesendet.`
              : 'Bitte Titel und Beschreibung möglichst konkret formulieren. Browser, Pfad und letzte Konsolenfehler werden automatisch mitgesendet.'}
          </DialogDescription>
          {(title || description) && (
            <p className="text-[10px] text-muted-foreground/80 italic">
              Entwurf wird automatisch zwischengespeichert.
            </p>
          )}
        </DialogHeader>


        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Art</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Schweregrad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Titel</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Kurz zusammengefasst, z. B. „Kanban-Karten verschieben sich nicht in Spalte X"
              className="h-8 text-xs"
              maxLength={200}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Beschreibung</Label>
              <MtiqButton
                text={description}
                onResult={(t) => setDescription(t)}
                minChars={10}
              />
            </div>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={kind === 'bug'
                ? 'Was wurde versucht? Was sollte passieren? Was ist tatsächlich passiert? Schritte zur Reproduktion?'
                : 'Bitte Anliegen oder Idee möglichst konkret beschreiben.'}
              className="min-h-[140px] text-xs"
              maxLength={4000}
            />
            <p className="text-[10px] text-muted-foreground">{description.length}/4000</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Anhänge & Screenshots (optional)</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-7 text-[11px] gap-1 px-2"
                  onClick={pasteFromClipboard}
                  title="Bild aus Zwischenablage einfügen (oder Strg+V)"
                >
                  <Clipboard className="h-3 w-3" />Einfügen
                </Button>
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-7 text-[11px] gap-1 px-2"
                  onClick={captureScreen}
                  title="Bildschirm / Fenster aufnehmen"
                >
                  <Monitor className="h-3 w-3" />Aufnehmen
                </Button>
              </div>
            </div>
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
              }}
              className="rounded-md border border-dashed border-border/60 bg-muted/20 px-3 py-2 space-y-2"
            >
              <Input
                type="file"
                multiple
                accept="image/*,video/*,application/pdf,.txt,.log"
                onChange={(e) => setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])}
                className="h-8 text-xs cursor-pointer"
              />
              <p className="text-[10px] text-muted-foreground">
                Tipp: Screenshot mit <kbd className="px-1 py-0.5 rounded bg-muted text-foreground text-[9px] font-mono">Strg+V</kbd> direkt einfügen, per Drag-and-Drop ablegen oder oben "Aufnehmen".
              </p>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {files.map((f, i) => {
                    const key = `${i}_${f.name}_${f.size}`;
                    const url = previews[key];
                    return (
                      <div key={key} className="relative group rounded-md border border-border bg-card overflow-hidden">
                        {url ? (
                          <img src={url} alt={f.name} className="h-16 w-16 object-cover" />
                        ) : (
                          <div className="h-16 w-16 flex flex-col items-center justify-center px-1 text-center">
                            <Paperclip className="h-4 w-4 text-muted-foreground mb-0.5" />
                            <span className="text-[8px] text-muted-foreground truncate w-full">{f.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Entfernen"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {files.length > 0 && (
                <p className="text-[10px] text-muted-foreground">{files.length} Datei(en) ausgewählt</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center gap-2 pt-2">
          <Button
            variant="ghost" size="sm"
            className="h-8 text-[11px] text-muted-foreground"
            onClick={discardDraft}
            disabled={submitting || (!title && !description && files.length === 0)}
            title="Entwurf verwerfen und Dialog schließen"
          >
            Entwurf verwerfen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={submitting}>
              Schließen
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
              Meldung senden
            </Button>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

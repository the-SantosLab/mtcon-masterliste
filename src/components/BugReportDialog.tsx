import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Bug } from 'lucide-react';
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

export function BugReportDialog({ open, onOpenChange, caseId, caseNo }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'bug' | 'idee' | 'frage' | 'sonstige'>('bug');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle(''); setDescription(''); setKind('bug'); setPriority('medium'); setFiles([]);
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

      const { data: inserted, error } = await supabase
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
      if (error) throw error;

      const ticketId = (inserted as any).id as string;
      const ticketNo = (inserted as any).ticket_number as string;

      // Anhänge hochladen
      if (files.length > 0) {
        for (const file of files) {
          const path = `internal/${ticketId}/${Date.now()}_${sanitizeFileName(file.name)}`;
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
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) { onOpenChange(o); if (!o) reset(); } }}>
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
            <Label className="text-xs">Beschreibung</Label>
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

          <div className="space-y-1">
            <Label className="text-xs">Anhänge (optional)</Label>
            <Input
              type="file"
              multiple
              accept="image/*,video/*,application/pdf,.txt,.log"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="h-8 text-xs cursor-pointer"
            />
            {files.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{files.length} Datei(en) ausgewählt</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)} disabled={submitting}>
            Abbrechen
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
            Meldung senden
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

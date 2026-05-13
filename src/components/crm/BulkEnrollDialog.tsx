import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Either contact ids OR company ids — pick one */
  contactIds?: string[];
  companyIds?: string[];
};

export function BulkEnrollDialog({ open, onClose, contactIds, companyIds }: Props) {
  const [seqs, setSeqs] = useState<any[]>([]);
  const [seqId, setSeqId] = useState('');
  const [busy, setBusy] = useState(false);
  const total = (contactIds?.length ?? 0) + (companyIds?.length ?? 0);

  useEffect(() => {
    if (!open) return;
    void supabase.from('sequences').select('id, name, status').order('created_at', { ascending: false })
      .then(({ data }) => setSeqs(data ?? []));
  }, [open]);

  const enroll = async () => {
    if (!seqId) { toast.error('Sequenz auswählen'); return; }
    setBusy(true);
    let rows: any[] = [];

    if (contactIds && contactIds.length) {
      const { data: cs } = await supabase.from('contacts').select('id, company_id').in('id', contactIds);
      rows = (cs ?? []).map(c => ({
        sequence_id: seqId, contact_id: c.id, company_id: c.company_id, status: 'aktiv',
        current_step_index: 0, started_at: new Date().toISOString(), next_action_at: new Date().toISOString(),
      }));
    } else if (companyIds && companyIds.length) {
      // For each company pick the first contact (if any), else company-only enrollment
      const { data: cs } = await supabase.from('contacts').select('id, company_id').in('company_id', companyIds);
      const byCo = new Map<string, string>();
      (cs ?? []).forEach(c => { if (!byCo.has(c.company_id)) byCo.set(c.company_id, c.id); });
      rows = companyIds.map(co => ({
        sequence_id: seqId, company_id: co, contact_id: byCo.get(co) ?? null, status: 'aktiv',
        current_step_index: 0, started_at: new Date().toISOString(), next_action_at: new Date().toISOString(),
      }));
    }

    if (rows.length === 0) { setBusy(false); toast.error('Keine Empfänger'); return; }
    const { error } = await supabase.from('sequence_enrollments').insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} eingeschrieben`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>In Sequenz einschreiben</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <p className="text-muted-foreground">{total} ausgewählt — alle in dieselbe Sequenz einschreiben:</p>
          <Select value={seqId} onValueChange={setSeqId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Sequenz auswählen…" /></SelectTrigger>
            <SelectContent>
              {seqs.map(s => <SelectItem key={s.id} value={s.id}>{s.name} {s.status === 'pausiert' && '(pausiert)'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={enroll} disabled={busy || !seqId} className="h-8 text-xs gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Einschreiben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

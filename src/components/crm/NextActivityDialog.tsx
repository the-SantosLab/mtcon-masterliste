import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const ACTIVITY_TYPES = [
  { key: 'call', label: 'Anruf' },
  { key: 'meeting', label: 'Meeting' },
  { key: 'email', label: 'E-Mail' },
  { key: 'task', label: 'Aufgabe' },
] as const;

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  d.setHours(9, 0, 0, 0);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deal: { id: string; title: string; company_id: string | null; owner_id?: string | null } | null;
  reason?: string;
  onSaved?: () => void;
}

/** Pipedrive-Prinzip: Jeder offene Deal braucht eine geplante nächste Aktivität. */
export function NextActivityDialog({ open, onOpenChange, deal, reason, onSaved }: Props) {
  const { user } = useAuth();
  const [type, setType] = useState<string>('call');
  const [subject, setSubject] = useState('');
  const [due, setDue] = useState(tomorrow());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setType('call'); setSubject(''); setDue(tomorrow()); }
  }, [open]);

  const save = async () => {
    if (!deal) return;
    if (!subject.trim()) { toast.error('Betreff erforderlich'); return; }
    if (!due) { toast.error('Fälligkeit erforderlich'); return; }
    setSaving(true);
    const { error } = await supabase.from('crm_activities').insert({
      deal_id: deal.id,
      company_id: deal.company_id,
      type: type as any,
      subject: subject.trim(),
      due_at: new Date(due).toISOString(),
      owner_id: deal.owner_id ?? user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Nächste Aktivität geplant');
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Nächste Aktivität planen</DialogTitle>
          <DialogDescription className="text-xs">
            {reason ?? 'Jeder offene Deal braucht einen nächsten Schritt.'} {deal ? `Deal: ${deal.title}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {ACTIVITY_TYPES.map(t => (
              <Button key={t.key} type="button" size="sm" variant={type === t.key ? 'default' : 'outline'}
                className="h-7 text-[11px] flex-1" onClick={() => setType(t.key)}>
                {t.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Betreff *</Label>
            <Input autoFocus value={subject} onChange={e => setSubject(e.target.value)} className="h-8 text-xs"
              placeholder="z. B. Rückfrage zum Angebot" onKeyDown={e => { if (e.key === 'Enter') void save(); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fällig am *</Label>
            <Input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Später</Button>
          <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Planen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


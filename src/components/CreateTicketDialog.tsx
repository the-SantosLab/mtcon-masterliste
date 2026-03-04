import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { Department } from '@/lib/ticket-types';
import { TICKET_PRIORITIES, PRIORITY_LABELS } from '@/lib/ticket-types';

interface Props {
  open: boolean;
  onClose: () => void;
  departmentId?: string;
  departments: Department[];
  onCreated?: () => void;
}

interface Profile {
  id: string;
  display_name: string;
  short_code: string;
}

export function CreateTicketDialog({ open, onClose, departmentId, departments, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deptId, setDeptId] = useState(departmentId || '');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDeptId(departmentId || '');
      supabase.from('users_profile').select('id, display_name, short_code').eq('active', true).order('display_name')
        .then(({ data }) => setProfiles((data || []) as Profile[]));
    }
  }, [open, departmentId]);

  const handleSave = async () => {
    if (!title.trim()) return toast.error('Titel ist erforderlich');
    if (!deptId) return toast.error('Abteilung ist erforderlich');
    setSaving(true);
    try {
      const { error } = await supabase.rpc('create_ticket_atomic', {
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_department_id: deptId,
        p_assigned_to: assignedTo || null,
        p_priority: priority,
        p_due_date: dueDate || null,
      });
      if (error) throw error;
      toast.success('Ticket erstellt');
      setTitle(''); setDescription(''); setAssignedTo(''); setPriority('medium'); setDueDate('');
      onClose();
      onCreated?.();
    } catch (err: any) {
      toast.error(err.message || 'Fehler beim Erstellen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-sm font-semibold">Neues Ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Titel *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-xs" placeholder="Titel des Tickets" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Beschreibung</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="text-xs min-h-[60px]" placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Abteilung *</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen…" /></SelectTrigger>
                <SelectContent>
                  {departments.filter(d => d.is_active !== false).map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.parent_id ? '  ' : ''}{d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priorität</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map(p => (
                    <SelectItem key={p} value={p} className="text-xs">{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Zuweisen an</Label>
              <Select value={assignedTo || '_none'} onValueChange={v => setAssignedTo(v === '_none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Niemand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" className="text-xs">Niemand</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fällig am</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs mt-1">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Erstellen…</> : 'Ticket erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

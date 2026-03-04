import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import type { Department } from '@/lib/case-utils';

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

export function CreateCaseFromDeptDialog({ open, onClose, departmentId, departments, onCreated }: Props) {
  const { user } = useAuth();
  const [projectName, setProjectName] = useState('');
  const [note, setNote] = useState('');
  const [deptId, setDeptId] = useState(departmentId || '');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueAt, setDueAt] = useState('');
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
    if (!projectName.trim()) return toast.error('Titel ist erforderlich');
    if (!deptId) return toast.error('Abteilung ist erforderlich');
    if (!user?.id) return toast.error('Nicht angemeldet');
    setSaving(true);
    try {
      // case_no is auto-generated via trigger, but we need a placeholder
      const { error } = await supabase.from('cases').insert({
        project_name: projectName.trim(),
        case_no: 'TEMP', // will be overwritten by assign_case_number trigger via case_number
        note: note.trim() || null,
        department_id: deptId,
        assignee_id: assigneeId || null,
        due_at: dueAt || null,
        created_by: user.id,
      });
      if (error) throw error;
      toast.success('Vorgang erstellt');
      setProjectName(''); setNote(''); setAssigneeId(''); setDueAt('');
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
        <DialogHeader><DialogTitle className="text-sm font-semibold">Neuer Vorgang</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Titel *</Label>
            <Input value={projectName} onChange={e => setProjectName(e.target.value)} className="h-8 text-xs" placeholder="Bezeichnung des Vorgangs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notiz</Label>
            <Textarea value={note} onChange={e => setNote(e.target.value)} className="text-xs min-h-[60px]" placeholder="Optional" />
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
              <Label className="text-xs text-muted-foreground">Zuweisen an</Label>
              <Select value={assigneeId || '_none'} onValueChange={v => setAssigneeId(v === '_none' ? '' : v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Niemand" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none" className="text-xs">Niemand</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Fällig am</Label>
            <Input type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full h-8 text-xs mt-1">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Erstellen…</> : 'Vorgang erstellen'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

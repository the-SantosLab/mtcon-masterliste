import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';

interface Props {
  caseId: string;
  defaultTitle: string;
  defaultDescription?: string | null;
  defaultDepartmentId?: string | null;
}

export function SaveAsTemplateDialog({ caseId, defaultTitle, defaultDescription, defaultDepartmentId }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription || '');
  const [saving, setSaving] = useState(false);

  const onOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      setTitle(defaultTitle);
      setDescription(defaultDescription || '');
    }
  };

  const save = async () => {
    if (!title.trim()) { toast.error('Titel ist Pflicht'); return; }
    setSaving(true);
    try {
      // Load tasks of this case
      const { data: tasks, error: tErr } = await (supabase as any).from('case_tasks')
        .select('title, description, department_id, sort_order')
        .eq('case_id', caseId)
        .order('sort_order');
      if (tErr) throw tErr;

      const { data: tpl, error } = await (supabase as any).from('case_templates').insert({
        title: title.trim(), description: description.trim() || null,
      }).select('id').single();
      if (error) throw error;

      if (defaultDepartmentId) {
        await (supabase as any).from('case_template_departments').insert({
          template_id: tpl.id, department_id: defaultDepartmentId,
        });
      }
      if (tasks && tasks.length) {
        await (supabase as any).from('case_template_tasks').insert(
          (tasks as any[]).map((t: any, i: number) => ({
            template_id: tpl.id,
            title: t.title,
            description: t.description,
            department_id: t.department_id,
            order_index: i,
          })),
        );
      }
      toast.success('Vorlage gespeichert');
      setOpen(false);
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpen}>
      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onOpen(true)}>
        <FileText className="h-3.5 w-3.5" />Als Vorlage speichern
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Vorgang als Vorlage speichern</DialogTitle>
          <DialogDescription className="text-xs">
            Titel, Beschreibung und alle Unteraufgaben werden übernommen. Zuordnungen und Status werden zurückgesetzt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Titel *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Beschreibung</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-8 text-xs">Abbrechen</Button>
          <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
            {saving ? 'Speichern…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

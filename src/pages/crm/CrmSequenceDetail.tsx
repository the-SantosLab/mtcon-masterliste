import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, Trash2, GripVertical, Mail, Clock, ListTodo, Save } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { applySequenceVariables } from '@/lib/sequenceVars';

type Step = { id: string; order_index: number; type: 'email'|'wait'|'task'; subject: string|null; body: string|null; wait_days: number|null; task_title: string|null; task_assignee: string|null };

export default function CrmSequenceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [seq, setSeq] = useState<any>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sample = { vorname: 'Anna', nachname: 'Müller', unternehmen: 'Beispiel AG', ansprechpartner: 'Anna Müller', email: 'anna@beispiel.de' };

  useEffect(() => { void load(); }, [id]);
  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: st }] = await Promise.all([
      supabase.from('sequences').select('*').eq('id', id).single(),
      supabase.from('sequence_steps').select('*').eq('sequence_id', id).order('order_index'),
    ]);
    setSeq(s); setSteps((st ?? []) as Step[]); setLoading(false);
  };

  const addStep = async (type: 'email'|'wait'|'task') => {
    const order = steps.length;
    const payload: any = { sequence_id: id, type, order_index: order };
    if (type === 'wait') payload.wait_days = 3;
    if (type === 'email') { payload.subject = ''; payload.body = ''; }
    if (type === 'task') payload.task_title = '';
    const { data, error } = await supabase.from('sequence_steps').insert(payload).select('*').single();
    if (error) { toast.error(error.message); return; }
    setSteps([...steps, data as Step]);
  };

  const updateStep = (sid: string, patch: Partial<Step>) => {
    setSteps(steps.map(s => s.id === sid ? { ...s, ...patch } : s));
  };

  const saveStep = async (s: Step) => {
    const { error } = await supabase.from('sequence_steps').update({
      subject: s.subject, body: s.body, wait_days: s.wait_days, task_title: s.task_title, task_assignee: s.task_assignee,
    }).eq('id', s.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Gespeichert');
  };

  const removeStep = async (sid: string) => {
    if (!confirm('Schritt entfernen?')) return;
    await supabase.from('sequence_steps').delete().eq('id', sid);
    setSteps(steps.filter(s => s.id !== sid));
  };

  const onDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = steps.findIndex(s => s.id === active.id);
    const newIdx = steps.findIndex(s => s.id === over.id);
    const next = arrayMove(steps, oldIdx, newIdx).map((s, i) => ({ ...s, order_index: i }));
    setSteps(next);
    await Promise.all(next.map(s => supabase.from('sequence_steps').update({ order_index: s.order_index }).eq('id', s.id)));
  };

  const updateSeq = async (patch: any) => {
    const { error } = await supabase.from('sequences').update(patch).eq('id', id!);
    if (error) { toast.error(error.message); return; }
    setSeq({ ...seq, ...patch });
  };

  if (loading) return <CrmLayout><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></CrmLayout>;
  if (!seq) return <CrmLayout><p className="text-sm text-muted-foreground">Sequenz nicht gefunden.</p></CrmLayout>;

  return (
    <CrmLayout>
      <button onClick={() => navigate('/crm/outbound')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück
      </button>

      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex-1 max-w-xl space-y-2">
          <Input value={seq.name} onChange={e => setSeq({ ...seq, name: e.target.value })} onBlur={() => updateSeq({ name: seq.name })} className="h-9 text-base font-semibold" />
          <Textarea value={seq.description ?? ''} onChange={e => setSeq({ ...seq, description: e.target.value })} onBlur={() => updateSeq({ description: seq.description })} placeholder="Beschreibung…" className="text-xs min-h-[50px]" />
        </div>
        <Select value={seq.status} onValueChange={v => updateSeq({ status: v })}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pausiert">Pausiert</SelectItem>
            <SelectItem value="aktiv">Aktiv</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 mb-3">
        <Button size="sm" variant="outline" onClick={() => addStep('email')} className="h-8 text-xs gap-1.5"><Mail className="h-3.5 w-3.5" />E-Mail</Button>
        <Button size="sm" variant="outline" onClick={() => addStep('wait')} className="h-8 text-xs gap-1.5"><Clock className="h-3.5 w-3.5" />Warten</Button>
        <Button size="sm" variant="outline" onClick={() => addStep('task')} className="h-8 text-xs gap-1.5"><ListTodo className="h-3.5 w-3.5" />Task</Button>
      </div>

      <p className="text-[10px] text-muted-foreground mb-3">Variablen: <code>{'{{vorname}}'}</code> <code>{'{{nachname}}'}</code> <code>{'{{unternehmen}}'}</code> <code>{'{{ansprechpartner}}'}</code> <code>{'{{email}}'}</code></p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {steps.map((s, i) => <StepCard key={s.id} step={s} index={i} onChange={updateStep} onSave={saveStep} onRemove={removeStep} sample={sample} />)}
          </div>
        </SortableContext>
      </DndContext>

      {steps.length === 0 && <p className="text-xs text-muted-foreground py-8 text-center">Noch keine Schritte. Füge oben einen hinzu.</p>}
    </CrmLayout>
  );
}

function StepCard({ step, index, onChange, onSave, onRemove, sample }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="rounded border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground"><GripVertical className="h-4 w-4" /></button>
        <span className="text-[11px] text-muted-foreground tabular-nums">#{index + 1}</span>
        <span className="text-xs font-semibold text-foreground capitalize">
          {step.type === 'email' && 'E-Mail'}
          {step.type === 'wait' && 'Warten'}
          {step.type === 'task' && 'Task'}
        </span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onSave(step)} className="h-6 w-6 p-0"><Save className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" onClick={() => onRemove(step.id)} className="h-6 w-6 p-0 text-destructive"><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {step.type === 'email' && (
        <div className="space-y-2">
          <Input value={step.subject ?? ''} onChange={e => onChange(step.id, { subject: e.target.value })} placeholder="Betreff" className="h-8 text-xs" />
          <Textarea value={step.body ?? ''} onChange={e => onChange(step.id, { body: e.target.value })} placeholder="Body" className="text-xs min-h-[100px]" />
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Vorschau mit Beispiel-Daten</summary>
            <div className="mt-2 p-2 rounded bg-muted/30 space-y-1">
              <p className="font-semibold text-foreground">{applySequenceVariables(step.subject ?? '', sample)}</p>
              <p className="whitespace-pre-wrap text-foreground">{applySequenceVariables(step.body ?? '', sample)}</p>
            </div>
          </details>
        </div>
      )}
      {step.type === 'wait' && (
        <div className="flex items-center gap-2">
          <Label className="text-xs">Tage warten:</Label>
          <Input type="number" min={1} value={step.wait_days ?? 1} onChange={e => onChange(step.id, { wait_days: Number(e.target.value) })} className="h-8 text-xs w-20" />
        </div>
      )}
      {step.type === 'task' && (
        <Input value={step.task_title ?? ''} onChange={e => onChange(step.id, { task_title: e.target.value })} placeholder="Task-Titel" className="h-8 text-xs" />
      )}
    </div>
  );
}

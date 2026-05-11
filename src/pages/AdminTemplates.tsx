import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Eye, Copy, X, ArrowUp, ArrowDown, ListChecks, ArrowRightCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/case-utils';
import { Navigate } from 'react-router-dom';

interface Department { id: string; name: string; code: string | null; parent_id: string | null; }
interface TemplateTask {
  id?: string;
  title: string;
  description: string | null;
  department_id: string | null;
  assigned_role: string | null;
  order_index: number;
}
interface Template {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  last_used_at: string | null;
  sequential_mode: boolean;
  due_required: boolean;
  department_ids: string[];
  task_count: number;
}

const emptyForm = (): { title: string; description: string; sequential_mode: boolean; due_required: boolean; department_ids: string[]; tasks: TemplateTask[] } => ({
  title: '', description: '', sequential_mode: false, due_required: false, department_ids: [], tasks: [],
});

export default function AdminTemplates() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewTasks, setPreviewTasks] = useState<TemplateTask[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (isAdmin) loadAll(); }, [isAdmin]);

  const loadAll = async () => {
    setLoading(true);
    const [tplRes, deptRes, joinRes, taskCountRes] = await Promise.all([
      (supabase as any).from('case_templates').select('id, title, description, created_at, last_used_at, sequential_mode, due_required').order('created_at', { ascending: false }),
      supabase.from('departments').select('id, name, code, parent_id').eq('is_active', true).order('sort_order'),
      (supabase as any).from('case_template_departments').select('template_id, department_id'),
      (supabase as any).from('case_template_tasks').select('template_id'),
    ]);
    const counts = new Map<string, number>();
    ((taskCountRes.data || []) as any[]).forEach(r => counts.set(r.template_id, (counts.get(r.template_id) || 0) + 1));
    const deptMap = new Map<string, string[]>();
    ((joinRes.data || []) as any[]).forEach(r => {
      const arr = deptMap.get(r.template_id) || [];
      arr.push(r.department_id);
      deptMap.set(r.template_id, arr);
    });
    setTemplates(((tplRes.data || []) as any[]).map(t => ({
      ...t, department_ids: deptMap.get(t.id) || [], task_count: counts.get(t.id) || 0,
    })));
    setDepartments((deptRes.data || []) as Department[]);
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>();
    const noDept: Template[] = [];
    for (const t of templates) {
      if (t.department_ids.length === 0) noDept.push(t);
      else for (const d of t.department_ids) {
        const arr = map.get(d) || [];
        arr.push(t);
        map.set(d, arr);
      }
    }
    const result: { dept: Department | null; items: Template[] }[] = [];
    for (const d of departments) {
      const items = map.get(d.id);
      if (items?.length) result.push({ dept: d, items });
    }
    if (noDept.length) result.push({ dept: null, items: noDept });
    return result;
  }, [templates, departments]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const openEdit = async (id: string) => {
    setEditingId(id);
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const { data: tasks } = await (supabase as any).from('case_template_tasks')
      .select('id, title, description, department_id, assigned_role, order_index')
      .eq('template_id', id).order('order_index');
    setForm({
      title: tpl.title,
      description: tpl.description || '',
      sequential_mode: tpl.sequential_mode || false,
      due_required: tpl.due_required || false,
      department_ids: [...tpl.department_ids],
      tasks: ((tasks || []) as any[]).map((t, i) => ({ ...t, order_index: i })),
    });
    setEditorOpen(true);
  };

  const openPreview = async (id: string) => {
    setPreviewId(id);
    setPreviewLoading(true);
    const { data } = await (supabase as any).from('case_template_tasks')
      .select('id, title, description, department_id, assigned_role, order_index')
      .eq('template_id', id).order('order_index');
    setPreviewTasks((data || []) as TemplateTask[]);
    setPreviewLoading(false);
  };

  const addTask = () => setForm(f => ({ ...f, tasks: [...f.tasks, { title: '', description: '', department_id: null, assigned_role: null, order_index: f.tasks.length }] }));
  const updateTask = (idx: number, patch: Partial<TemplateTask>) =>
    setForm(f => ({ ...f, tasks: f.tasks.map((t, i) => i === idx ? { ...t, ...patch } : t) }));
  const removeTask = (idx: number) =>
    setForm(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx).map((t, i) => ({ ...t, order_index: i })) }));
  const moveTask = (idx: number, dir: -1 | 1) => {
    setForm(f => {
      const arr = [...f.tasks];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return f;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...f, tasks: arr.map((t, i) => ({ ...t, order_index: i })) };
    });
  };

  const toggleDept = (id: string) =>
    setForm(f => ({ ...f, department_ids: f.department_ids.includes(id) ? f.department_ids.filter(x => x !== id) : [...f.department_ids, id] }));

  const save = async () => {
    if (!form.title.trim()) { toast.error('Titel ist Pflicht'); return; }
    if (form.tasks.some(t => !t.title.trim())) { toast.error('Alle Unteraufgaben brauchen einen Titel'); return; }
    setSaving(true);
    try {
      let tplId = editingId;
      if (editingId) {
        const { error } = await (supabase as any).from('case_templates').update({
          title: form.title.trim(), description: form.description.trim() || null, sequential_mode: form.sequential_mode, due_required: form.due_required,
        }).eq('id', editingId);
        if (error) throw error;
        await (supabase as any).from('case_template_departments').delete().eq('template_id', editingId);
        await (supabase as any).from('case_template_tasks').delete().eq('template_id', editingId);
      } else {
        const { data, error } = await (supabase as any).from('case_templates').insert({
          title: form.title.trim(), description: form.description.trim() || null, sequential_mode: form.sequential_mode, due_required: form.due_required,
        }).select('id').single();
        if (error) throw error;
        tplId = data.id;
      }
      if (form.department_ids.length) {
        await (supabase as any).from('case_template_departments').insert(
          form.department_ids.map(d => ({ template_id: tplId, department_id: d })),
        );
      }
      if (form.tasks.length) {
        await (supabase as any).from('case_template_tasks').insert(
          form.tasks.map((t, i) => ({
            template_id: tplId,
            title: t.title.trim(),
            description: t.description?.trim() || null,
            department_id: t.department_id || null,
            assigned_role: t.assigned_role?.trim() || null,
            order_index: i,
          })),
        );
      }
      toast.success(editingId ? 'Vorlage aktualisiert' : 'Vorlage erstellt');
      setEditorOpen(false);
      await loadAll();
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from('case_templates').delete().eq('id', deleteId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    toast.success('Vorlage gelöscht');
    setDeleteId(null);
    await loadAll();
  };

  const duplicate = async (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    const { data: tasks } = await (supabase as any).from('case_template_tasks')
      .select('title, description, department_id, assigned_role, order_index')
      .eq('template_id', id).order('order_index');
    const { data: newTpl, error } = await (supabase as any).from('case_templates').insert({
      title: tpl.title + ' (Kopie)', description: tpl.description, sequential_mode: tpl.sequential_mode,
    }).select('id').single();
    if (error) { toast.error('Fehler: ' + error.message); return; }
    if (tpl.department_ids.length) {
      await (supabase as any).from('case_template_departments').insert(
        tpl.department_ids.map(d => ({ template_id: newTpl.id, department_id: d })),
      );
    }
    if (tasks?.length) {
      await (supabase as any).from('case_template_tasks').insert(
        (tasks as any[]).map((t: any) => ({ ...t, template_id: newTpl.id })),
      );
    }
    toast.success('Vorlage dupliziert');
    await loadAll();
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Vorlagen</h1>
            <p className="text-xs text-muted-foreground mt-1">Standardisierte Vorgangs-Vorlagen mit Unteraufgaben.</p>
          </div>
          <Button size="sm" onClick={openNew} className="h-8 text-xs gap-1.5">
            <Plus className="h-3.5 w-3.5" />Neue Vorlage
          </Button>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground">Laden…</p>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <ListChecks className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Noch keine Vorlagen</p>
            <p className="text-xs text-muted-foreground mt-1">Lege die erste Vorlage an, um Vorgänge zu standardisieren.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.dept?.id || 'none'}>
                <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {group.dept ? group.dept.name : 'Ohne Abteilung'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.items.map(t => (
                    <div key={t.id} className="rounded-md border border-border bg-card p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                          {t.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{t.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{t.task_count} Aufgabe{t.task_count === 1 ? '' : 'n'}</span>
                        {t.sequential_mode && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                            <ArrowRightCircle className="h-2.5 w-2.5" />Sequenziell
                          </span>
                        )}
                        {t.last_used_at && <span>· Zuletzt: {formatDate(t.last_used_at)}</span>}
                      </div>
                      {t.department_ids.length > 1 && (
                        <div className="flex flex-wrap gap-1">
                          {t.department_ids.map(did => {
                            const d = departments.find(x => x.id === did);
                            return d ? <span key={did} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{d.name}</span> : null;
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-1 pt-2 border-t border-border">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openPreview(t.id)}>
                          <Eye className="h-3 w-3" />Vorschau
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => openEdit(t.id)}>
                          <Pencil className="h-3 w-3" />Bearbeiten
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => duplicate(t.id)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive ml-auto" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{editingId ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</DialogTitle>
            <DialogDescription className="text-xs">Definiere Titel, Abteilungen und Unteraufgaben.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Titel *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Beschreibung</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="text-xs" />
            </div>
            <div className="flex items-start justify-between gap-3 rounded border border-border bg-muted/20 p-2.5">
              <div className="space-y-0.5">
                <Label className="text-xs text-foreground flex items-center gap-1.5">
                  <ArrowRightCircle className="h-3.5 w-3.5" />Sequenzieller Modus
                </Label>
                <p className="text-[10px] text-muted-foreground">Unteraufgaben müssen strikt nacheinander abgeschlossen werden.</p>
              </div>
              <Switch
                checked={form.sequential_mode}
                onCheckedChange={v => setForm(f => ({ ...f, sequential_mode: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Abteilungen</Label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded border border-border p-2 bg-muted/20">
                {departments.map(d => {
                  const on = form.department_ids.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.id)}
                      className={`text-[11px] px-2 py-0.5 rounded border ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border hover:border-primary/50'}`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Unteraufgaben</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addTask} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" />Aufgabe
                </Button>
              </div>
              {form.tasks.length === 0 && <p className="text-[11px] text-muted-foreground italic">Noch keine Aufgaben.</p>}
              {form.tasks.map((t, i) => (
                <div key={i} className="rounded border border-border bg-muted/20 p-2 space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    <div className="flex-1 space-y-1.5">
                      <Input
                        value={t.title}
                        onChange={e => updateTask(i, { title: e.target.value })}
                        placeholder="Titel der Aufgabe *"
                        className="h-7 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <Select
                          value={t.department_id || '_none'}
                          onValueChange={v => updateTask(i, { department_id: v === '_none' ? null : v })}
                        >
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Abteilung" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Keine Abteilung</SelectItem>
                            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input
                          value={t.assigned_role || ''}
                          onChange={e => updateTask(i, { assigned_role: e.target.value })}
                          placeholder="Rolle (optional)"
                          className="h-7 text-[11px]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveTask(i, -1)} disabled={i === 0}><ArrowUp className="h-3 w-3" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveTask(i, 1)} disabled={i === form.tasks.length - 1}><ArrowDown className="h-3 w-3" /></Button>
                      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeTask(i)}><X className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={save} disabled={saving} className="h-8 text-xs">
              {saving ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog open={!!previewId} onOpenChange={o => !o && setPreviewId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Vorschau</DialogTitle>
            <DialogDescription className="text-xs">{templates.find(t => t.id === previewId)?.title}</DialogDescription>
          </DialogHeader>
          {previewLoading ? <p className="text-xs text-muted-foreground">Laden…</p> : (
            <ol className="space-y-1.5 list-decimal list-inside">
              {previewTasks.map(t => (
                <li key={t.id} className="text-xs">
                  <span className="font-medium">{t.title}</span>
                  {t.department_id && <span className="text-muted-foreground ml-1.5 text-[10px]">· {departments.find(d => d.id === t.department_id)?.name}</span>}
                </li>
              ))}
              {previewTasks.length === 0 && <p className="text-xs text-muted-foreground italic">Keine Aufgaben.</p>}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage wird endgültig entfernt. Bereits aus dieser Vorlage erstellte Vorgänge bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

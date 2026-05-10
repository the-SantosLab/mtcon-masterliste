import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckSquare, Square, Plus, Trash2, Loader2, Building2, User, ChevronDown, AlertTriangle, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isMasterUser } from '@/lib/master-users';

interface Subtask {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  sort_order: number;
  department_id: string | null;
  assigned_to: string | null;
  status: string;
}

interface Dept { id: string; name: string; code: string | null; parent_id: string | null; }
interface Profile { id: string; display_name: string; short_code: string; department_id: string | null; }

interface CaseSubtasksProps {
  caseId: string;
  canEdit: boolean;
  userId: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  open: { label: 'Offen', color: 'bg-muted-foreground' },
  in_progress: { label: 'In Arbeit', color: 'bg-[hsl(var(--status-working))]' },
  done: { label: 'Erledigt', color: 'bg-[hsl(var(--status-done))]' },
};

const STATUS_LABELS: Record<string, string> = {
  nicht_begonnen: 'Nicht begonnen', in_planung: 'In Planung', in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug', ready_for_review: 'Zur Prüfung', blocked: 'Blockiert',
  abgeschlossen: 'Abgeschlossen', verworfen: 'Verworfen', archiv: 'Archiv',
};

export function CaseSubtasks({ caseId, canEdit, userId }: CaseSubtasksProps) {
  const [tasks, setTasks] = useState<Subtask[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<Subtask | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [savingCompletion, setSavingCompletion] = useState(false);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('case_tasks')
      .select('*')
      .eq('case_id', caseId)
      .order('sort_order')
      .order('created_at');
    setTasks((data as Subtask[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
    supabase.from('departments').select('id, name, code, parent_id').eq('is_active', true).order('sort_order')
      .then(r => setDepartments((r.data || []) as Dept[]));
    supabase.from('users_profile').select('id, display_name, short_code, department_id').eq('active', true)
      .then(r => setProfiles((r.data || []) as Profile[]));
  }, [caseId]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('case_tasks').insert({
      case_id: caseId,
      title: newTitle.trim(),
      created_by: userId,
      sort_order: tasks.length,
      department_id: newDeptId || null,
      status: 'open',
    } as any);
    if (error) toast.error('Fehler: ' + error.message);
    else {
      setNewTitle('');
      setNewDeptId('');
      await fetchTasks();
    }
    setAdding(false);
  };

  const updateTaskStatus = async (task: Subtask, newStatus: string) => {
    if (newStatus === 'done') {
      setCompletingTask(task);
      setCompletionNote('');
      return;
    }
    const { error } = await supabase.from('case_tasks').update({
      status: newStatus,
      completed: false,
      completed_at: null,
      completed_by: null,
    } as any).eq('id', task.id);
    if (error) { toast.error('Fehler'); return; }
    fetchTasks();
  };

  const confirmCompletion = async () => {
    if (!completingTask) return;
    const note = completionNote.trim();
    if (!note) { toast.error('Bitte beschreibe, was gemacht wurde'); return; }
    setSavingCompletion(true);
    const task = completingTask;
    const { error } = await supabase.from('case_tasks').update({
      status: 'done',
      completed: true,
      completed_at: new Date().toISOString(),
      completed_by: userId,
    } as any).eq('id', task.id);
    if (error) { toast.error('Fehler'); setSavingCompletion(false); return; }

    await supabase.from('case_activity').insert({
      case_id: caseId,
      task_id: task.id,
      action: 'task_completed',
      actor_id: userId,
      field: 'completion_note',
      new_value: note,
      message: `Unteraufgabe „${task.title}" erledigt: ${note}`,
    } as any);

    await autoForward(task);

    // Notify watchers via email (fire-and-forget)
    supabase.functions.invoke('notify-task-abgeschlossen', { body: { caseId, taskId: task.id, actorId: userId } }).catch(() => {});

    setCompletingTask(null);
    setCompletionNote('');
    setSavingCompletion(false);
    fetchTasks();
  };

  const autoForward = async (completedTask: Subtask) => {
    setWarning(null);

    // Fetch workflow settings from DB
    const { data: wsRows } = await supabase.from('workflow_settings').select('key, value');
    const ws: Record<string, any> = {};
    (wsRows || []).forEach(r => { ws[r.key] = r.value; });

    const allDoneStatus = ws['all_tasks_done_status'] || 'ready_for_review';
    const noDeptStatus = ws['no_department_status'] || 'blocked';
    const forwardEnabled = ws['auto_forward_enabled'] !== false && ws['auto_forward_enabled'] !== 'false';
    const autoAssign = ws['auto_assign_on_forward'] === true || ws['auto_assign_on_forward'] === 'true';

    const sortedTasks = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
    const currentIdx = sortedTasks.findIndex(t => t.id === completedTask.id);
    const nextTask = sortedTasks.slice(currentIdx + 1).find(t => t.status !== 'done');

    // Case 1: No more subtasks → configurable status
    if (!nextTask) {
      const allDone = sortedTasks.filter(t => t.id !== completedTask.id).every(t => t.status === 'done');
      if (allDone) {
        await supabase.from('cases').update({
          status: allDoneStatus as any,
          last_changed_by: userId,
          last_changed_at: new Date().toISOString(),
        }).eq('id', caseId);

        const statusLabel = STATUS_LABELS[allDoneStatus] || allDoneStatus;
        await supabase.from('case_activity').insert({
          case_id: caseId,
          action: 'auto_forward',
          field: 'status',
          old_value: 'in_arbeit',
          new_value: allDoneStatus,
          actor_id: userId,
          message: `Alle Unteraufgaben erledigt – Vorgang auf „${statusLabel}" gesetzt`,
        });
        toast.success(`Alle Unteraufgaben erledigt – Status: ${statusLabel}`);
      }
      return;
    }

    // Case 2: Next subtask has no department → configurable status
    if (!nextTask.department_id) {
      await supabase.from('cases').update({
        status: noDeptStatus as any,
        last_changed_by: userId,
        last_changed_at: new Date().toISOString(),
      }).eq('id', caseId);

      const statusLabel = STATUS_LABELS[noDeptStatus] || noDeptStatus;
      await supabase.from('case_activity').insert({
        case_id: caseId,
        action: 'auto_forward',
        field: 'status',
        old_value: 'in_arbeit',
        new_value: noDeptStatus,
        actor_id: userId,
        message: `${statusLabel}: Unteraufgabe "${nextTask.title}" hat keine zugewiesene Abteilung`,
      });

      setWarning(`Nächste Unteraufgabe "${nextTask.title}" hat keine zugewiesene Abteilung`);
      toast.warning(`Vorgang ${statusLabel.toLowerCase()} – nächste Unteraufgabe hat keine Abteilung`);
      return;
    }

    // Case 3: Auto-forward disabled → skip
    if (!forwardEnabled) return;

    // Case 4: Next subtask has a different department → forward
    if (nextTask.department_id !== completedTask.department_id) {
      const dept = departments.find(d => d.id === nextTask.department_id);
      const deptManager = autoAssign ? dept && profiles.find(p => p.department_id === nextTask.department_id) : null;

      const { error } = await supabase.from('cases').update({
        department_id: nextTask.department_id,
        assignee_id: deptManager?.id || null,
        status: 'in_arbeit' as any,
        last_changed_by: userId,
        last_changed_at: new Date().toISOString(),
      }).eq('id', caseId);

      if (!error && dept) {
        const msg = deptManager
          ? `Automatisch an ${dept.name} weitergeleitet und ${deptManager.display_name} zugewiesen`
          : `Automatisch weitergeleitet (Unteraufgabe "${completedTask.title}" erledigt)`;
        await supabase.from('case_activity').insert({
          case_id: caseId,
          action: 'auto_forward',
          field: 'department_id',
          old_value: departments.find(d => d.id === completedTask.department_id)?.name || 'Unbekannt',
          new_value: dept.name,
          actor_id: userId,
          message: msg,
        });
        toast.success(`Vorgang automatisch an ${dept.name} weitergeleitet`);
      }
    }
  };

  const updateAssignee = async (taskId: string, assigneeId: string) => {
    const val = assigneeId === '_none' ? null : assigneeId;
    await supabase.from('case_tasks').update({ assigned_to: val } as any).eq('id', taskId);
    fetchTasks();
  };

  const updateDepartment = async (taskId: string, deptId: string) => {
    const val = deptId === '_none' ? null : deptId;
    await supabase.from('case_tasks').update({ department_id: val } as any).eq('id', taskId);
    fetchTasks();
  };

  const updateTitle = async (taskId: string, title: string) => {
    const t = title.trim();
    if (!t) return;
    const { error } = await supabase.from('case_tasks').update({ title: t } as any).eq('id', taskId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    await supabase.from('case_tasks').delete().eq('id', taskId);
    fetchTasks();
  };

  const completedCount = tasks.filter(t => t.status === 'done').length;
  const totalCount = tasks.length;

  const getDeptName = (id: string | null) => {
    if (!id) return null;
    return departments.find(d => d.id === id)?.name;
  };

  const getProfileName = (id: string | null) => {
    if (!id) return null;
    const p = profiles.find(p => p.id === id);
    return p?.short_code;
  };

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Unteraufgaben
        </h3>
        {totalCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {completedCount}/{totalCount} erledigt
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 rounded-full bg-muted mb-4 overflow-hidden">
          <div
            className="h-full rounded-full bg-[hsl(var(--status-done))] transition-all duration-300"
            style={{ width: `${(completedCount / totalCount) * 100}%` }}
          />
        </div>
      )}

      {/* Warning banner */}
      {warning && (
        <Alert variant="destructive" className="mb-4 py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{warning}</AlertDescription>
        </Alert>
      )}

      {/* Task list */}
      <div className="space-y-1">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Laden…</p>
        ) : tasks.length === 0 && !canEdit ? (
          <p className="text-xs text-muted-foreground py-2">Keine Unteraufgaben</p>
        ) : (
          tasks.map(task => {
            const isExpanded = expandedId === task.id;
            const st = STATUS_MAP[task.status] || STATUS_MAP.open;
            const canEditTask = canEdit;
            return (
              <div key={task.id} className="rounded-md border border-border/50 overflow-hidden">
                <div
                  className="flex items-center gap-2 group py-2 px-3 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                >
                  <div className={cn('h-2 w-2 rounded-full shrink-0', st.color)} />
                  <span className={cn(
                    'flex-1 text-sm transition-colors',
                    task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
                  )}>
                    {task.title}
                  </span>
                  {getDeptName(task.department_id) && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1">
                      <Building2 className="h-2.5 w-2.5" />{getDeptName(task.department_id)}
                    </Badge>
                  )}
                  {getProfileName(task.assigned_to) && (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1">
                      <User className="h-2.5 w-2.5" />{getProfileName(task.assigned_to)}
                    </Badge>
                  )}
                  <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                </div>

                {isExpanded && canEditTask && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-border/50 bg-muted/20">
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Titel</p>
                      <Input
                        defaultValue={task.title}
                        className="h-7 text-xs"
                        onBlur={e => { if (e.target.value.trim() && e.target.value !== task.title) updateTitle(task.id, e.target.value); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Status</p>
                        <Select value={task.status} onValueChange={v => updateTaskStatus(task, v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_MAP).map(([k, v]) => (
                              <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Abteilung</p>
                        <Select value={task.department_id || '_none'} onValueChange={v => updateDepartment(task.id, v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none" className="text-xs">Keine</SelectItem>
                            {departments.map(d => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">
                                {d.code ? `${d.code} – ` : ''}{d.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground">Zuständig</p>
                        <Select value={task.assigned_to || '_none'} onValueChange={v => updateAssignee(task.id, v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none" className="text-xs">Niemand</SelectItem>
                            {profiles.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.display_name} ({p.short_code})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive hover:text-destructive" onClick={() => deleteTask(task.id)}>
                      <Trash2 className="h-3 w-3 mr-1" />Löschen
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add new subtask */}
      {canEdit && (
        <div className="flex gap-2 mt-3">
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Neue Unteraufgabe…"
            className="h-8 text-xs flex-1"
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <Select value={newDeptId || '_none'} onValueChange={v => setNewDeptId(v === '_none' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs w-[140px]">
              <SelectValue placeholder="Abt." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none" className="text-xs">Keine Abt.</SelectItem>
              {departments.map(d => (
                <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            className="h-8 text-xs gap-1 shrink-0"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      <Dialog open={!!completingTask} onOpenChange={(o) => { if (!o) { setCompletingTask(null); setCompletionNote(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Unteraufgabe abschließen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{completingTask?.title}</p>
            <label className="text-xs font-medium text-foreground">Was wurde gemacht?</label>
            <Textarea
              value={completionNote}
              onChange={e => setCompletionNote(e.target.value)}
              placeholder="Beschreibe kurz die durchgeführte Arbeit…"
              className="text-xs min-h-[100px]"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setCompletingTask(null); setCompletionNote(''); }} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={confirmCompletion} disabled={savingCompletion || !completionNote.trim()} className="h-8 text-xs">
              {savingCompletion ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Erledigt markieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

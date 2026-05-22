import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckSquare, Square, Plus, Trash2, Loader2, Building2, User, ChevronDown, AlertTriangle, FileText, GripVertical, ArrowUp, ArrowDown, Lock, CheckCircle2, ListChecks, GitBranch, ArrowUpDown } from 'lucide-react';
import { nextSort, type SortState }    from '@/components/SortableHeader';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { UrgencyPicker } from '@/components/UrgencyPicker';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isMasterUser } from '@/lib/master-users';
import { usePreferences } from '@/contexts/PreferencesContext';
import { NotifyToggle } from '@/components/NotifyToggle';
import { MtiqButton } from '@/components/MtiqButton';
import { useNotificationLog } from '@/hooks/useNotificationLog';

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
  due_at: string | null;
  urgency: number | null;
}

interface Dept { id: string; name: string; code: string | null; parent_id: string | null; }
interface Profile { id: string; display_name: string; short_code: string; department_id: string | null; }

interface CaseSubtasksProps {
  caseId: string;
  canEdit: boolean;
  userId: string;
  sequentialMode?: boolean;
  dueRequired?: boolean;
  lockMode?: 'hard' | 'soft';
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

interface SortableSubtaskRowProps {
  id: string;
  canReorder: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  children: (args: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode;
}

function SortableSubtaskRow({ id, canReorder, children }: SortableSubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !canReorder });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

interface ProcessViewProps {
  tasks: Subtask[];
  firstOpenIdx: number;
  departments: Dept[];
  profiles: Profile[];
  canEdit: boolean;
  completionNotes: Record<string, string>;
  onComplete: (t: Subtask) => void;
  onStart: (t: Subtask) => void;
  onLockedClick: (stepNum: number) => void;
}

function ProcessView({ tasks, firstOpenIdx, departments, profiles, canEdit, completionNotes, onComplete, onStart, onLockedClick }: ProcessViewProps) {
  const deptName = (id: string | null) => id ? departments.find(d => d.id === id)?.name : null;
  const profName = (id: string | null) => id ? profiles.find(p => p.id === id)?.short_code : null;
  return (
    <ol className="space-y-2">
      {tasks.map((t, idx) => {
        const isDone = t.status === 'done';
        const isActive = !isDone && idx === firstOpenIdx;
        const isLocked = !isDone && idx > firstOpenIdx && firstOpenIdx >= 0;
        const stepNum = idx + 1;
        const note = completionNotes[t.id];
        return (
          <li
            key={t.id}
            onClick={() => isLocked && onLockedClick(idx)}
            className={cn(
              'rounded-md border p-3 transition-colors flex gap-3 items-start',
              isActive && 'border-primary bg-primary/5 shadow-sm',
              isDone && 'border-border/40 bg-muted/30 opacity-80',
              isLocked && 'border-border/40 bg-muted/10 opacity-50 cursor-not-allowed',
              !isActive && !isDone && !isLocked && 'border-border bg-card'
            )}
            title={isLocked ? `Bitte zuerst Schritt ${idx} abschließen` : undefined}
          >
            <div className={cn(
              'h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold border-2',
              isDone && 'bg-[hsl(var(--status-done))]/20 border-[hsl(var(--status-done))] text-[hsl(var(--status-done))]',
              isActive && 'bg-primary text-primary-foreground border-primary',
              isLocked && 'bg-muted border-border text-muted-foreground',
              !isActive && !isDone && !isLocked && 'border-border text-muted-foreground'
            )}>
              {isDone ? <CheckCircle2 className="h-4 w-4" /> : isLocked ? <Lock className="h-3 w-3" /> : stepNum}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={cn('text-sm font-medium', isDone && 'line-through text-muted-foreground', !isDone && 'text-foreground')}>
                  {t.title}
                </p>
                {deptName(t.department_id) && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1">
                    <Building2 className="h-2.5 w-2.5" />{deptName(t.department_id)}
                  </Badge>
                )}
                {profName(t.assigned_to) && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 gap-1">
                    <User className="h-2.5 w-2.5" />{profName(t.assigned_to)}
                  </Badge>
                )}
              </div>
              {t.description && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{t.description}</p>}
              {isDone && note && (
                <p className="text-[11px] text-muted-foreground mt-1.5 italic">„{note}"</p>
              )}
              {isActive && canEdit && (
                <div className="flex gap-1.5 mt-2">
                  {t.status === 'open' && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStart(t)}>
                      Starten
                    </Button>
                  )}
                  <Button size="sm" className="h-6 text-[10px]" onClick={() => onComplete(t)}>
                    Erledigt markieren
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CaseSubtasks({ caseId, canEdit, userId, sequentialMode = false, dueRequired = false, lockMode = 'hard' }: CaseSubtasksProps) {
  const [tasks, setTasks] = useState<Subtask[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newDeptId, setNewDeptId] = useState('');
  const [newDueAt, setNewDueAt] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [noteExpandedId, setNoteExpandedId] = useState<string | null>(null);
  const [titleExpandedIds, setTitleExpandedIds] = useState<Set<string>>(new Set());
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [completingTask, setCompletingTask] = useState<Subtask | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'process'>('list');
  const { preferences } = usePreferences();
  const PAGE_SIZE = preferences.compactTables ? 5 : 20;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [PAGE_SIZE]);
  const [logBump, setLogBump] = useState(0);
  const { lastByType, refresh: refreshLog } = useNotificationLog(caseId, logBump);
  const [sendCreateEmail, setSendCreateEmail] = useState(true);
  const [sendCompleteEmail, setSendCompleteEmail] = useState(true);
  const [sendAssignEmail, setSendAssignEmail] = useState(true);

  // Locked-task indices in sequential mode: every task after the first non-done task is locked.
  // Im "soft"-Modus wird nicht hart gesperrt – die UI hebt nur die empfohlene Reihenfolge hervor.
  const sortedTasks = [...tasks].sort((a, b) => a.sort_order - b.sort_order);
  const firstOpenIdx = sortedTasks.findIndex(t => t.status !== 'done');
  const isLocked = (taskId: string): boolean => {
    if (!sequentialMode || lockMode === 'soft') return false;
    const idx = sortedTasks.findIndex(t => t.id === taskId);
    if (idx < 0) return false;
    if (sortedTasks[idx].status === 'done') return false;
    return firstOpenIdx >= 0 && idx > firstOpenIdx;
  };
  const isOutOfOrder = (taskId: string): boolean => {
    if (!sequentialMode) return false;
    const idx = sortedTasks.findIndex(t => t.id === taskId);
    if (idx < 0) return false;
    if (sortedTasks[idx].status === 'done') return false;
    return firstOpenIdx >= 0 && idx > firstOpenIdx;
  };
  const previousStepNumber = (taskId: string): number => {
    const idx = sortedTasks.findIndex(t => t.id === taskId);
    return idx;
  };

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('case_tasks')
      .select('*')
      .eq('case_id', caseId)
      .order('sort_order')
      .order('created_at');
    const list = (data as Subtask[]) || [];
    setTasks(list);
    // Fetch latest completion note per task
    const { data: acts } = await supabase
      .from('case_activity')
      .select('task_id, new_value, created_at')
      .eq('case_id', caseId)
      .eq('action', 'task_completed')
      .eq('field', 'completion_note')
      .order('created_at', { ascending: false });
    const map: Record<string, string> = {};
    (acts || []).forEach((a: any) => {
      if (a.task_id && !map[a.task_id] && a.new_value) map[a.task_id] = a.new_value;
    });
    setCompletionNotes(map);
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
    if (dueRequired && !newDueAt) { toast.error('„Fällig bis" ist verpflichtend'); return; }
    setAdding(true);
    const { data: ins, error } = await supabase.from('case_tasks').insert({
      case_id: caseId,
      title: newTitle.trim(),
      created_by: userId,
      sort_order: tasks.length,
      department_id: newDeptId || null,
      due_at: newDueAt || null,
      status: 'open',
    } as any).select('id').single();
    if (error) toast.error('Fehler: ' + error.message);
    else {
      setNewTitle('');
      setNewDeptId('');
      setNewDueAt('');
      await fetchTasks();
      if (ins?.id) {
        supabase.functions.invoke('notify-task-created', {
          body: { caseId, taskId: ins.id, actorId: userId },
        }).catch(() => {});
      }
    }
    setAdding(false);
  };

  const updateTaskStatus = async (task: Subtask, newStatus: string) => {
    if (sequentialMode && isLocked(task.id)) {
      toast.error(`Bitte zuerst Schritt ${previousStepNumber(task.id)} abschließen`);
      return;
    }
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
    if (sendCompleteEmail) {
      supabase.functions.invoke('notify-task-abgeschlossen', { body: { caseId, taskId: task.id, actorId: userId } })
        .then(() => setTimeout(() => { setLogBump(b => b + 1); }, 1500))
        .catch(() => {});
    }

    if (sequentialMode) {
      const idx = sortedTasks.findIndex(t => t.id === task.id);
      const nextStep = sortedTasks.slice(idx + 1).find(t => t.status !== 'done');
      const stepNum = idx + 1;
      if (nextStep) {
        toast.success(`Schritt ${stepNum} abgeschlossen – Schritt ${stepNum + 1} ist jetzt aktiv`);
      }
    }

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
    const { error } = await supabase.from('case_tasks').update({ assigned_to: val } as any).eq('id', taskId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
    if (val && val !== userId && sendAssignEmail) {
      supabase.functions.invoke('notify-task-assigned', { body: { caseId, taskId, assigneeId: val, actorId: userId } })
        .then(() => setTimeout(() => { setLogBump(b => b + 1); }, 1500))
        .catch(() => {});
    }
    fetchTasks();
  };

  const updateDueAt = async (taskId: string, due: string | null) => {
    if (dueRequired && !due) { toast.error('„Fällig bis" ist verpflichtend'); return; }
    const { error } = await supabase.from('case_tasks').update({ due_at: due } as any).eq('id', taskId);
    if (error) { toast.error('Fehler: ' + error.message); return; }
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
    setDeleting(true);
    const target = tasks.find(t => t.id === taskId);
    const { error, count } = await supabase
      .from('case_tasks')
      .delete({ count: 'exact' })
      .eq('id', taskId);
    setDeleting(false);
    setConfirmDeleteId(null);
    if (error) {
      toast.error('Löschen fehlgeschlagen: ' + error.message);
      return;
    }
    if (!count) {
      toast.error('Löschen nicht möglich – fehlende Berechtigung.');
      return;
    }
    toast.success(`Unteraufgabe „${target?.title ?? ''}" gelöscht`);
    fetchTasks();
  };

  const persistOrder = async (ordered: Subtask[]) => {
    const updates = ordered.map((t, idx) => ({ id: t.id, sort_order: idx }));
    // Optimistic update
    setTasks(ordered.map((t, idx) => ({ ...t, sort_order: idx })));
    // Persist sequentially (small list)
    for (const u of updates) {
      await supabase.from('case_tasks').update({ sort_order: u.sort_order } as any).eq('id', u.id);
    }
  };

  const moveTask = (taskId: string, direction: -1 | 1) => {
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= tasks.length) return;
    const next = arrayMove(tasks, idx, newIdx);
    persistOrder(next);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = tasks.findIndex(t => t.id === active.id);
    const newIdx = tasks.findIndex(t => t.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    persistOrder(arrayMove(tasks, oldIdx, newIdx));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Unteraufgaben
          </h3>
          {sequentialMode && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
              <GitBranch className="h-2.5 w-2.5" />Sequenziell
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {sequentialMode && totalCount > 0 && (
            <div className="inline-flex rounded border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn('text-[10px] px-2 py-1 flex items-center gap-1', viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <ListChecks className="h-3 w-3" />Liste
              </button>
              <button
                type="button"
                onClick={() => setViewMode('process')}
                className={cn('text-[10px] px-2 py-1 flex items-center gap-1 border-l border-border', viewMode === 'process' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                <GitBranch className="h-3 w-3" />Prozessansicht
              </button>
            </div>
          )}
          {totalCount > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {completedCount}/{totalCount} erledigt
            </span>
          )}
        </div>
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

      {/* Horizontale Prozess-Chevrons (ERP-Stil) */}
      {sequentialMode && sortedTasks.length > 0 && (
        <div className="mb-4 -mx-1 overflow-x-auto">
          <ol className="flex items-stretch gap-0 px-1 min-w-fit">
            {sortedTasks.map((t, idx) => {
              const isDone = t.status === 'done';
              const isActive = !isDone && idx === firstOpenIdx;
              const isLockedStep = !isDone && idx > firstOpenIdx && firstOpenIdx >= 0;
              const isSoftAhead = isLockedStep && lockMode === 'soft';
              const isHardLocked = isLockedStep && lockMode === 'hard';
              return (
                <li key={t.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`subtask-${t.id}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    title={t.title}
                    className={cn(
                      'flex items-center h-7 pl-3 pr-5 text-[10px] font-medium border-y border-l whitespace-nowrap max-w-[160px] truncate transition-colors',
                      idx === 0 && 'rounded-l-md',
                      idx === sortedTasks.length - 1 && 'border-r rounded-r-md pr-3',
                      isDone && 'bg-[hsl(var(--status-done))]/15 border-[hsl(var(--status-done))]/40 text-[hsl(var(--status-done))]',
                      isActive && 'bg-primary text-primary-foreground border-primary',
                      isHardLocked && 'bg-muted/40 border-border text-muted-foreground/60',
                      isSoftAhead && 'bg-muted/20 border-dashed border-border text-muted-foreground hover:text-foreground',
                      !isDone && !isActive && !isLockedStep && 'bg-card border-border text-foreground hover:bg-muted/40',
                    )}
                    style={
                      idx < sortedTasks.length - 1
                        ? { clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)' }
                        : { clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)' }
                    }
                  >
                    <span className="mr-1 inline-flex items-center justify-center h-3.5 w-3.5 shrink-0">
                      {isDone ? <CheckCircle2 className="h-3 w-3" /> : isHardLocked ? <Lock className="h-2.5 w-2.5" /> : idx + 1}
                    </span>
                    <span className="truncate">{t.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {lockMode === 'soft' && (
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              Sequenzieller Prozess (weicher Modus): Folgeschritte sind bearbeitbar, die empfohlene Reihenfolge ist gestrichelt markiert.
            </p>
          )}
        </div>
      )}

      {/* Warning banner */}
      {warning && (
        <Alert variant="destructive" className="mb-4 py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">{warning}</AlertDescription>
        </Alert>
      )}

      {/* Task list / Process view */}
      <div className={cn(viewMode === 'process' && sequentialMode ? 'space-y-3' : 'space-y-1')}>
        {viewMode === 'process' && sequentialMode && !loading && tasks.length > 0 ? (
          <ProcessView
            tasks={sortedTasks}
            firstOpenIdx={firstOpenIdx}
            departments={departments}
            profiles={profiles}
            canEdit={canEdit}
            completionNotes={completionNotes}
            onComplete={(t) => updateTaskStatus(t, 'done')}
            onStart={async (t) => {
              const { error } = await supabase.from('case_tasks').update({ status: 'in_progress' } as any).eq('id', t.id);
              if (error) toast.error('Fehler'); else fetchTasks();
            }}
            onLockedClick={(stepNum) => toast.error(`Bitte zuerst Schritt ${stepNum} abschließen`)}
          />
        ) : null}
        {(viewMode !== 'process' || !sequentialMode) && (
        <>
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Laden…</p>
        ) : tasks.length === 0 && !canEdit ? (
          <p className="text-xs text-muted-foreground py-2">Keine Unteraufgaben</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.slice(0, visibleCount).map(t => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.slice(0, visibleCount).map((task, index) => {
                const isExpanded = expandedId === task.id;
                const st = STATUS_MAP[task.status] || STATUS_MAP.open;
                const canEditTask = canEdit;
                const note = completionNotes[task.id];
                const hasNote = task.status === 'done' && !!note;
                const isNoteOpen = noteExpandedId === task.id;
                const taskLocked = isLocked(task.id);
                return (
                  <SortableSubtaskRow
                    key={task.id}
                    id={task.id}
                    canReorder={canEdit}
                    isFirst={index === 0}
                    isLast={index === tasks.length - 1}
                    onMoveUp={() => moveTask(task.id, -1)}
                    onMoveDown={() => moveTask(task.id, 1)}
                  >
                    {({ dragHandleProps, isDragging }) => (
                      <div
                        className={cn('rounded-md border border-border/50 overflow-hidden bg-card', isDragging && 'shadow-lg ring-1 ring-primary/40', taskLocked && 'opacity-50')}
                        title={taskLocked ? `Bitte zuerst Schritt ${previousStepNumber(task.id)} abschließen` : undefined}
                        onClickCapture={(e) => {
                          if (taskLocked) {
                            e.stopPropagation();
                            e.preventDefault();
                            toast.error(`Bitte zuerst Schritt ${previousStepNumber(task.id)} abschließen`);
                          }
                        }}
                      >
                        <div
                          className="flex items-center gap-2 group py-2 px-3 hover:bg-muted/40 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : task.id)}
                        >
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                {...dragHandleProps}
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Zum Sortieren ziehen"
                                title="Ziehen zum Sortieren"
                                className="hidden md:flex shrink-0 items-center justify-center h-5 w-4 -ml-1 text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing touch-none"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </button>
                              <div className="flex md:hidden flex-col -ml-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveTask(task.id, -1); }}
                                  disabled={index === 0}
                                  aria-label="Nach oben"
                                  className="h-3.5 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveTask(task.id, 1); }}
                                  disabled={index === tasks.length - 1}
                                  aria-label="Nach unten"
                                  className="h-3.5 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </button>
                              </div>
                            </>
                          )}
                          <div className={cn('h-2 w-2 rounded-full shrink-0', st.color)} />
                          {taskLocked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          {(() => {
                            const isDone = task.status === 'done';
                            const isLong = (task.title?.length || 0) > 50;
                            const showCollapse = isDone && isLong;
                            const isTitleOpen = titleExpandedIds.has(task.id);
                            const toggleTitle = (e: React.MouseEvent) => {
                              e.stopPropagation();
                              setTitleExpandedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
                                return next;
                              });
                            };
                            const titleClass = cn(
                              'flex-1 text-sm transition-colors break-words',
                              isDone ? 'line-through text-muted-foreground' : 'text-foreground',
                              showCollapse && !isTitleOpen && 'line-clamp-2'
                            );
                            return (
                              <>
                                {showCollapse && (
                                  <button
                                    type="button"
                                    onClick={toggleTitle}
                                    aria-label={isTitleOpen ? 'Einklappen' : 'Ausklappen'}
                                    className="shrink-0 self-start mt-0.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !isTitleOpen && '-rotate-90')} />
                                  </button>
                                )}
                                {hasNote ? (
                                  <TooltipProvider delayDuration={300}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className={cn(titleClass, 'cursor-help')}>{task.title}</span>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        className="max-w-[300px] whitespace-pre-wrap break-words bg-[hsl(0_0%_12%/0.95)] text-white border-0 shadow-lg px-3 py-2"
                                        style={{ fontSize: '13px', borderRadius: '6px' }}
                                      >
                                        {note}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className={titleClass}>{task.title}</span>
                                )}
                              </>
                            );
                          })()}
                          {hasNote && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setNoteExpandedId(isNoteOpen ? null : task.id); }}
                              title={isNoteOpen ? 'Abschlussnotiz ausblenden' : 'Abschlussnotiz anzeigen'}
                              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
                            >
                              <FileText className="h-3 w-3" />
                              <ChevronDown className={cn('h-3 w-3 transition-transform', isNoteOpen && 'rotate-180')} />
                            </button>
                          )}
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
                          {task.due_at && (() => {
                            const overdue = task.status !== 'done' && new Date(task.due_at) < new Date(new Date().toDateString());
                            return (
                              <span className={cn('text-[10px] px-1 py-0', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                                Fällig: {new Date(task.due_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                              </span>
                            );
                          })()}
                          <span onClick={(e) => e.stopPropagation()} className="ml-auto">
                            <UrgencyPicker value={(task as any).urgency} table="case_tasks" rowId={task.id} readOnly={!canEditTask} size="xs" />
                          </span>
                          <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                        </div>

                        {hasNote && isNoteOpen && (
                          <div className="px-3 pb-3 pt-2 border-t border-border/50">
                            <div
                              className="ml-4 rounded-md bg-muted/40 border border-border/40 px-3 py-2 whitespace-pre-wrap break-words text-foreground"
                              style={{ fontSize: '13px', lineHeight: '1.5' }}
                            >
                              {note}
                            </div>
                          </div>
                        )}

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
                              <div className="space-y-1">
                                <p className="text-[10px] text-muted-foreground">Fällig bis{dueRequired ? ' *' : ''}</p>
                                <Input
                                  type="date"
                                  defaultValue={task.due_at || ''}
                                  className="h-7 text-[11px]"
                                  onBlur={e => { if ((e.target.value || null) !== task.due_at) updateDueAt(task.id, e.target.value || null); }}
                                />
                              </div>
                            <Button variant="ghost" size="sm" className="h-6 text-[11px] text-destructive hover:text-destructive" onClick={() => setConfirmDeleteId(task.id)}>
                              <Trash2 className="h-3 w-3 mr-1" />Löschen
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </SortableSubtaskRow>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
        {!loading && tasks.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-border/40">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {Math.min(visibleCount, tasks.length)} von {tasks.length}
            </span>
            {visibleCount < tasks.length && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, tasks.length))}
              >
                Mehr laden ({Math.min(PAGE_SIZE, tasks.length - visibleCount)})
              </Button>
            )}
            {visibleCount > PAGE_SIZE && visibleCount >= tasks.length && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => setVisibleCount(PAGE_SIZE)}
              >
                Weniger anzeigen
              </Button>
            )}
          </div>
        )}
        </>
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
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
          <NotifyToggle
            checked={sendAssignEmail}
            onChange={setSendAssignEmail}
            lastSentAt={lastByType['task_assigned']}
            label="E-Mail bei Zuweisung von Unteraufgaben senden"
            recipientsHint="an neuen Bearbeiter"
          />
        </div>
      )}

      <Dialog open={!!completingTask} onOpenChange={(o) => { if (!o) { setCompletingTask(null); setCompletionNote(''); } }}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">Unteraufgabe abschließen</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
            <p className="text-xs text-muted-foreground">{completingTask?.title}</p>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Was wurde gemacht?</label>
              <MtiqButton text={completionNote} onResult={setCompletionNote} />
            </div>
            <Textarea
              value={completionNote}
              onChange={e => setCompletionNote(e.target.value)}
              placeholder="Beschreibe kurz die durchgeführte Arbeit…"
              className="text-xs min-h-[100px]"
              autoFocus
            />
            <div className="border-t border-border pt-2">
              <NotifyToggle
                checked={sendCompleteEmail}
                onChange={setSendCompleteEmail}
                lastSentAt={lastByType['task_abgeschlossen']}
                recipientsHint="an Watcher des Vorgangs"
              />
            </div>
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

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => { if (!o) setConfirmDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unteraufgabe löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const t = tasks.find(x => x.id === confirmDeleteId);
                return t
                  ? `„${t.title}" wird unwiderruflich gelöscht. Im Aktivitätsverlauf bleibt der Eintrag erhalten.`
                  : 'Diese Aktion kann nicht rückgängig gemacht werden.';
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (confirmDeleteId) deleteTask(confirmDeleteId); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Lösche…' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

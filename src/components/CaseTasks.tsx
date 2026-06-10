import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CheckSquare, Square, Plus, Trash2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';

interface CaseTask {
  id: string;
  case_id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string;
  created_at: string;
  sort_order: number;
}

interface CaseTasksProps {
  caseId: string;
  canEdit: boolean;
  userId: string;
}

export function CaseTasks({ caseId, canEdit, userId }: CaseTasksProps) {
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from('case_tasks')
      .select('*')
      .eq('case_id', caseId)
      .order('sort_order')
      .order('created_at');
    setTasks((data as CaseTask[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [caseId]);

  const addTask = async () => {
    if (!newTitle.trim()) return;
    setAdding(true);
    const { data: ins, error } = await supabase.from('case_tasks').insert({
      case_id: caseId,
      title: newTitle.trim(),
      created_by: userId,
      sort_order: tasks.length,
    }).select('id').single();
    if (error) toastError(error, 'case_task');
    else {
      setNewTitle('');
      await fetchTasks();
      if (ins?.id) {
        supabase.functions.invoke('notify-task-created', {
          body: { caseId, taskId: ins.id, actorId: userId },
        }).catch(() => {});
      }
    }
    setAdding(false);
  };

  const toggleTask = async (task: CaseTask) => {
    const completed = !task.completed;
    const { data, error } = await supabase.from('case_tasks').update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? userId : null,
    }).eq('id', task.id).select('id');
    if (error) { toastError(error, 'case_task'); return; }
    if (!data || data.length === 0) {
      toast.error('Du hast keine Berechtigung, diese Aufgabe zu ändern. Bitte wende dich an den Zuständigen oder einen Admin.');
      return;
    }
    fetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase.from('case_tasks').delete().eq('id', taskId);
    if (error) toastError(error, 'case_task');
    else fetchTasks();
  };

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;

  return (
    <div className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Aufgaben
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

      {/* Task list */}
      <div className="space-y-1">
        {loading ? (
          <p className="text-xs text-muted-foreground py-2">Laden…</p>
        ) : tasks.length === 0 && !canEdit ? (
          <p className="text-xs text-muted-foreground py-2">Keine Aufgaben</p>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task.id}
              className={cn(
                'flex items-center gap-2 group py-1.5 px-1 rounded hover:bg-foreground/10 transition-colors',
                index % 2 === 1 && 'bg-foreground/[0.08]'
              )}
            >
              <button
                onClick={() => canEdit && toggleTask(task)}
                disabled={!canEdit}
                className={cn(
                  'shrink-0 transition-colors',
                  canEdit ? 'cursor-pointer' : 'cursor-default',
                  task.completed ? 'text-[hsl(var(--status-done))]' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {task.completed ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>
              <span className={cn(
                'flex-1 text-sm transition-colors',
                task.completed ? 'line-through text-muted-foreground' : 'text-foreground'
              )}>
                {task.title}
              </span>
              {canEdit && (
                <button
                  onClick={() => deleteTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add new task */}
      {canEdit && (
        <div className="flex gap-2 mt-3">
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Neue Aufgabe…"
            className="h-8 text-xs flex-1"
            onKeyDown={e => e.key === 'Enter' && addTask()}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={addTask}
            disabled={adding || !newTitle.trim()}
            className="h-8 text-xs gap-1 shrink-0"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Hinzufügen
          </Button>
        </div>
      )}
    </div>
  );
}

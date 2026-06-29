import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, Archive, FileCheck2, AlertCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  required_outputs: string[] | null;
  completed_outputs: string[] | null;
  sort_order: number;
}

interface CaseRow {
  id: string;
  status: string;
  case_no: string;
  closed_at: string | null;
  closed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  closure_summary: string | null;
  closure_outputs: any;
}

interface Props {
  caseId: string;
  canEdit: boolean;
  isAdmin: boolean;
  userId: string;
  onChanged?: () => void;
}

interface AggregatedOutput {
  label: string;
  taskId: string;
  taskTitle: string;
  done: boolean;
  completedAt: string | null;
  completedBy: string | null;
}

export function CaseOutputPanel({ caseId, canEdit, isAdmin, userId, onChanged }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('case_tasks').select('id,title,completed,completed_at,completed_by,required_outputs,completed_outputs,sort_order').eq('case_id', caseId).order('sort_order'),
      supabase.from('cases').select('id,status,case_no,closed_at,closed_by,archived_at,archived_by,closure_summary,closure_outputs').eq('id', caseId).maybeSingle(),
    ]);
    const taskList = (t as any as Task[]) || [];
    setTasks(taskList);
    setCaseRow(c as any);
    setSummary((c as any)?.closure_summary || '');

    const userIds = Array.from(new Set([
      ...taskList.map(x => x.completed_by).filter(Boolean) as string[],
      (c as any)?.closed_by,
      (c as any)?.archived_by,
    ].filter(Boolean) as string[]));
    if (userIds.length) {
      const { data: ps } = await supabase.from('users_profile').select('id,full_name,short_code').in('id', userIds);
      const map: Record<string, string> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p.full_name || p.short_code || ''; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [caseId]);

  const aggregated: AggregatedOutput[] = useMemo(() => {
    const out: AggregatedOutput[] = [];
    tasks.forEach((t) => {
      const req = Array.isArray(t.required_outputs) ? t.required_outputs : [];
      const done = Array.isArray(t.completed_outputs) ? t.completed_outputs : [];
      req.forEach((label) => {
        out.push({
          label,
          taskId: t.id,
          taskTitle: t.title,
          done: done.includes(label),
          completedAt: done.includes(label) ? t.completed_at : null,
          completedBy: done.includes(label) ? t.completed_by : null,
        });
      });
    });
    return out;
  }, [tasks]);

  const totalOutputs = aggregated.length;
  const doneOutputs = aggregated.filter(o => o.done).length;
  const allTasksDone = tasks.length > 0 && tasks.every(t => t.completed);
  const allOutputsDone = totalOutputs === 0 || doneOutputs === totalOutputs;
  const canClose = canEdit && allTasksDone && allOutputsDone && caseRow && caseRow.status !== 'abgeschlossen' && caseRow.status !== 'archiv';
  const canArchive = canEdit && caseRow?.status === 'abgeschlossen' && !caseRow.archived_at;
  const isArchived = !!caseRow?.archived_at || caseRow?.status === 'archiv';
  const isClosed = caseRow?.status === 'abgeschlossen' || isArchived;

  const closeCase = async () => {
    if (!caseRow) return;
    setBusy(true);
    const now = new Date().toISOString();
    const snapshot = aggregated.map(o => ({ label: o.label, task_id: o.taskId, completed_at: o.completedAt, completed_by: o.completedBy }));
    const { error } = await supabase.from('cases').update({
      status: 'abgeschlossen' as any,
      completed_at: now,
      closed_at: now,
      closed_by: userId,
      closure_summary: summary.trim() || null,
      closure_outputs: snapshot as any,
      last_changed_by: userId,
      last_changed_at: now,
    }).eq('id', caseId);
    setBusy(false);
    if (error) { toastError(error, 'case_update'); return; }
    await supabase.from('case_activity').insert({ case_id: caseId, action: 'STATUS_CHANGE', field: 'status', old_value: caseRow.status, new_value: 'abgeschlossen', actor_id: userId });
    toast.success('Vorgang abgeschlossen');
    onChanged?.();
    load();
  };

  const archiveCase = async () => {
    if (!caseRow) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('cases').update({
      status: 'archiv' as any,
      archived_at: now,
      archived_by: userId,
      last_changed_by: userId,
      last_changed_at: now,
    }).eq('id', caseId);
    setBusy(false);
    if (error) { toastError(error, 'case_update'); return; }
    await supabase.from('case_activity').insert({ case_id: caseId, action: 'STATUS_CHANGE', field: 'status', old_value: caseRow.status, new_value: 'archiv', actor_id: userId });
    toast.success('Vorgang archiviert');
    onChanged?.();
    load();
  };

  const unarchive = async () => {
    if (!caseRow || !isAdmin) return;
    setBusy(true);
    const now = new Date().toISOString();
    const { error } = await supabase.from('cases').update({
      status: 'abgeschlossen' as any,
      archived_at: null,
      archived_by: null,
      last_changed_by: userId,
      last_changed_at: now,
    }).eq('id', caseId);
    setBusy(false);
    if (error) { toastError(error, 'case_update'); return; }
    await supabase.from('case_activity').insert({ case_id: caseId, action: 'STATUS_CHANGE', field: 'status', old_value: 'archiv', new_value: 'abgeschlossen', actor_id: userId });
    toast.success('Aus Archiv geholt');
    onChanged?.();
    load();
  };

  if (loading) return null;

  return (
    <div className="rounded-md border border-border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <FileCheck2 className="h-3.5 w-3.5" /> Abschluss & Outputs
        </h3>
        {isArchived && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Archiviert</span>
        )}
      </div>

      {/* Output Aggregation */}
      {totalOutputs > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Pflicht-Outputs</p>
            <span className="text-[11px] text-muted-foreground">{doneOutputs}/{totalOutputs}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', allOutputsDone ? 'bg-[hsl(var(--status-done))]' : 'bg-primary')}
              style={{ width: `${totalOutputs ? (doneOutputs / totalOutputs) * 100 : 0}%` }}
            />
          </div>
          <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {aggregated.map((o, i) => (
              <li key={`${o.taskId}-${o.label}-${i}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                {o.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--status-done))] shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className={cn('truncate', o.done ? 'text-foreground' : 'text-muted-foreground')}>{o.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{o.taskTitle}</div>
                </div>
                {o.done && (
                  <div className="text-[10px] text-muted-foreground text-right shrink-0">
                    {o.completedBy && profiles[o.completedBy] && <div>{profiles[o.completedBy]}</div>}
                    {o.completedAt && <div>{format(new Date(o.completedAt), 'dd.MM.yy HH:mm', { locale: de })}</div>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Keine Pflicht-Outputs definiert.</p>
      )}

      {/* Closure Summary */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Abschluss-Zusammenfassung</p>
        <Textarea
          value={summary}
          onChange={e => setSummary(e.target.value)}
          placeholder="Kurze Notiz zum Abschluss (optional)…"
          rows={3}
          disabled={!canEdit || isClosed}
          className="text-xs"
        />
      </div>

      {/* Status info */}
      {isClosed && caseRow && (
        <div className="rounded-md bg-muted/40 border border-border p-3 space-y-1 text-[11px] text-muted-foreground">
          {caseRow.closed_at && (
            <div>Abgeschlossen am {format(new Date(caseRow.closed_at), 'dd.MM.yyyy HH:mm', { locale: de })}{caseRow.closed_by && profiles[caseRow.closed_by] ? ` von ${profiles[caseRow.closed_by]}` : ''}</div>
          )}
          {caseRow.archived_at && (
            <div>Archiviert am {format(new Date(caseRow.archived_at), 'dd.MM.yyyy HH:mm', { locale: de })}{caseRow.archived_by && profiles[caseRow.archived_by] ? ` von ${profiles[caseRow.archived_by]}` : ''}</div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {!isClosed && (
          <Button
            size="sm"
            onClick={closeCase}
            disabled={!canClose || busy}
            className="gap-1.5"
            title={!allTasksDone ? 'Alle Aufgaben müssen erledigt sein' : !allOutputsDone ? 'Alle Pflicht-Outputs müssen abgehakt sein' : ''}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Vorgang abschließen
          </Button>
        )}
        {canArchive && (
          <Button size="sm" variant="outline" onClick={archiveCase} disabled={busy} className="gap-1.5">
            <Archive className="h-3.5 w-3.5" /> Archivieren
          </Button>
        )}
        {isArchived && isAdmin && (
          <Button size="sm" variant="outline" onClick={unarchive} disabled={busy} className="gap-1.5">
            <Lock className="h-3.5 w-3.5" /> Aus Archiv holen
          </Button>
        )}
        {!isClosed && !canClose && (totalOutputs > 0 || tasks.length > 0) && (
          <p className="text-[11px] text-muted-foreground self-center">
            {!allTasksDone ? 'Alle Aufgaben abschließen, ' : ''}{!allOutputsDone ? `${totalOutputs - doneOutputs} Output(s) fehlen` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PlayCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Props {
  caseId: string;
  userId: string;
  canEdit: boolean;
  onChanged?: () => void;
}

interface Subtask {
  id: string;
  title: string;
  status: string;
  department_id: string | null;
  assigned_to: string | null;
  sort_order: number;
}

export function CaseBlockedBanner({ caseId, userId, canEdit, onChanged }: Props) {
  const [reason, setReason] = useState<string>('');
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data: tasks } = await supabase
        .from('case_tasks')
        .select('id, title, status, department_id, assigned_to, sort_order')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true });
      if (!active) return;
      const list = (tasks || []) as Subtask[];
      const open = list.filter(t => t.status !== 'done');
      const nextOpen = open[0];

      if (!nextOpen) {
        setReason('Es sind keine offenen Unteraufgaben vorhanden, der Vorgang ist trotzdem als blockiert markiert.');
        setNextSteps([
          'Prüfe, ob neue Unteraufgaben benötigt werden.',
          'Falls alles erledigt ist, kannst du den Vorgang direkt wieder freigeben.',
        ]);
      } else if (!nextOpen.department_id) {
        setReason(`Die nächste Unteraufgabe „${nextOpen.title}" hat keine zugewiesene Abteilung.`);
        setNextSteps([
          'Weise der Unteraufgabe eine Abteilung zu.',
          'Optional: Lege auch einen Bearbeiter fest.',
          'Anschließend Vorgang wieder auf „In Arbeit" setzen.',
        ]);
      } else if (!nextOpen.assigned_to) {
        setReason(`Die nächste Unteraufgabe „${nextOpen.title}" hat noch keinen Bearbeiter.`);
        setNextSteps([
          'Weise der Unteraufgabe einen Bearbeiter zu.',
          'Vorgang anschließend wieder auf „In Arbeit" setzen.',
        ]);
      } else {
        setReason(`Nächste offene Unteraufgabe: „${nextOpen.title}".`);
        setNextSteps([
          'Alle Voraussetzungen scheinen erfüllt zu sein.',
          'Du kannst den Vorgang direkt wieder auf „In Arbeit" setzen.',
        ]);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [caseId]);

  const unblock = async () => {
    if (!canEdit) return;
    setUnblocking(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('cases')
      .update({ status: 'in_arbeit' as any, last_changed_by: userId, last_changed_at: now })
      .eq('id', caseId);
    if (error) {
      toast.error('Fehler beim Entblocken: ' + error.message);
      setUnblocking(false);
      return;
    }
    await supabase.from('case_activity').insert({
      case_id: caseId,
      action: 'STATUS_CHANGE',
      field: 'status',
      old_value: 'blocked',
      new_value: 'in_arbeit',
      actor_id: userId,
      message: 'Vorgang manuell entblockt',
    });
    toast.success('Vorgang ist wieder „In Arbeit"');
    setUnblocking(false);
    onChanged?.();
  };

  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-xs font-semibold text-destructive">Vorgang blockiert</p>
          <p className="text-[11px] text-muted-foreground">
            {loading ? 'Analysiere Ursache…' : reason}
          </p>
          {!loading && nextSteps.length > 0 && (
            <div className="pt-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">Nächste Schritte</p>
              <ul className="mt-0.5 space-y-0.5 text-[11px] text-foreground/80 list-disc pl-4">
                {nextSteps.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs shrink-0 gap-1.5">
                <PlayCircle className="h-3.5 w-3.5" />
                Weiterbearbeiten
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm">Vorgang wieder aufnehmen?</AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  Der Vorgang wird von „Blockiert" auf „In Arbeit" gesetzt. Stelle sicher, dass die genannten nächsten Schritte erledigt oder geplant sind.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs">Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={unblock} disabled={unblocking} className="text-xs">
                  {unblocking ? 'Wird gesetzt…' : 'Ja, weiterbearbeiten'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

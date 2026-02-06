import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useCaseActions(userId: string | undefined, onSuccess?: () => void) {
  const claimCase = async (caseId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('cases')
      .update({
        assignee_id: userId,
        status: 'in_arbeit' as const,
        started_at: now,
        last_changed_by: userId,
        last_changed_at: now,
      })
      .eq('id', caseId)
      .is('assignee_id', null)
      .select();

    if (error) { toast.error('Fehler beim Abholen'); return; }
    if (!data || data.length === 0) { toast.error('Vorgang bereits vergeben'); return; }

    await supabase.from('case_activity').insert({
      case_id: caseId, action: 'CLAIM', actor_id: userId,
    });
    toast.success('Vorgang abgeholt');
    onSuccess?.();
  };

  const unclaimCase = async (caseId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('cases')
      .update({
        assignee_id: null,
        last_changed_by: userId,
        last_changed_at: now,
      })
      .eq('id', caseId);

    if (error) { toast.error('Fehler beim Freigeben'); return; }

    await supabase.from('case_activity').insert({
      case_id: caseId, action: 'UNCLAIM', actor_id: userId,
    });
    toast.success('Vorgang freigegeben');
    onSuccess?.();
  };

  const completeCase = async (caseId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('cases')
      .update({
        status: 'abgeschlossen' as const,
        completed_at: now,
        closed_by: userId,
        closed_at: now,
        last_changed_by: userId,
        last_changed_at: now,
      })
      .eq('id', caseId);

    if (error) { toast.error('Fehler beim Abschließen'); return; }

    await supabase.from('case_activity').insert({
      case_id: caseId, action: 'CLOSE', actor_id: userId,
      field: 'status', new_value: 'abgeschlossen',
    });
    toast.success('Vorgang abgeschlossen');
    onSuccess?.();
  };

  return { claimCase, unclaimCase, completeCase };
}

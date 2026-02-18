import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

async function notifyUser(userId: string, type: string, title: string, body: string, href: string) {
  await supabase.from('notifications').insert({ user_id: userId, type, title, body, href });
}

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
      .select('id, case_no, project_name');

    if (error) { toast.error('Fehler beim Abholen'); return; }
    if (!data || data.length === 0) { toast.error('Vorgang bereits vergeben'); return; }

    const c = data[0] as { id: string; case_no: string; project_name: string };
    await Promise.all([
      supabase.from('case_activity').insert({ case_id: caseId, action: 'CLAIM', actor_id: userId }),
      notifyUser(userId, 'assignment', `Vorgang abgeholt: ${c.case_no}`, c.project_name, `/cases/${c.id}`),
    ]);
    toast.success('Vorgang abgeholt');
    onSuccess?.();
  };

  const unclaimCase = async (caseId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('cases')
      .update({ assignee_id: null, last_changed_by: userId, last_changed_at: now })
      .eq('id', caseId);

    if (error) { toast.error('Fehler beim Freigeben'); return; }

    await supabase.from('case_activity').insert({ case_id: caseId, action: 'UNCLAIM', actor_id: userId });
    toast.success('Vorgang freigegeben');
    onSuccess?.();
  };

  const completeCase = async (caseId: string) => {
    if (!userId) return;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('cases')
      .update({
        status: 'abgeschlossen' as const,
        completed_at: now,
        closed_by: userId,
        closed_at: now,
        last_changed_by: userId,
        last_changed_at: now,
      })
      .eq('id', caseId)
      .select('id, case_no, project_name, created_by');

    if (error) { toast.error('Fehler beim Abschließen'); return; }

    const c = (data?.[0]) as { id: string; case_no: string; project_name: string; created_by: string } | undefined;
    await supabase.from('case_activity').insert({
      case_id: caseId, action: 'CLOSE', actor_id: userId,
      field: 'status', new_value: 'abgeschlossen',
    });
    if (c && c.created_by && c.created_by !== userId) {
      await notifyUser(c.created_by, 'status_change', `Vorgang abgeschlossen: ${c.case_no}`, c.project_name, `/cases/${c.id}`);
    }
    toast.success('Vorgang abgeschlossen');
    onSuccess?.();
  };

  return { claimCase, unclaimCase, completeCase };
}

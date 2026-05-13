import { useEffect, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, Pause, Play, X, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { applySequenceVariables } from '@/lib/sequenceVars';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

export default function CrmEnrollments() {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => { void load(); }, []);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('sequence_enrollments').select(`
      id, status, current_step_index, next_action_at, started_at,
      contacts(id, first_name, last_name, email),
      companies(id, name),
      sequences(id, name)
    `).order('next_action_at', { ascending: true, nullsFirst: false });
    setRows(data ?? []);
    setLoading(false);
  };

  const update = async (id: string, patch: any) => {
    const { error } = await supabase.from('sequence_enrollments').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const runDue = async (e: any) => {
    // Load step
    const { data: steps } = await supabase.from('sequence_steps').select('*').eq('sequence_id', e.sequences.id).order('order_index');
    const step = steps?.[e.current_step_index];
    if (!step) { await update(e.id, { status: 'abgeschlossen', next_action_at: null }); return; }
    const vars = {
      vorname: e.contacts?.first_name, nachname: e.contacts?.last_name,
      unternehmen: e.companies?.name,
      ansprechpartner: `${e.contacts?.first_name ?? ''} ${e.contacts?.last_name ?? ''}`.trim(),
      email: e.contacts?.email,
    };
    if (step.type === 'email') {
      setDraft({ enrollment: e, step, steps, subject: applySequenceVariables(step.subject ?? '', vars), body: applySequenceVariables(step.body ?? '', vars) });
    } else if (step.type === 'task') {
      await supabase.from('crm_activities').insert({
        company_id: e.companies?.id, contact_id: e.contacts?.id,
        type: 'task', subject: applySequenceVariables(step.task_title ?? 'Task', vars),
        owner_id: step.task_assignee ?? user?.id, auto_generated: true,
      });
      await supabase.from('sequence_step_executions').insert({ enrollment_id: e.id, step_id: step.id, executed_by: user?.id, result: 'task_created' });
      await advance(e, steps);
    } else if (step.type === 'wait') {
      await supabase.from('sequence_step_executions').insert({ enrollment_id: e.id, step_id: step.id, executed_by: user?.id, result: 'waited' });
      await advance(e, steps);
    }
  };

  const advance = async (e: any, steps: any[]) => {
    const nextIdx = e.current_step_index + 1;
    if (nextIdx >= steps.length) {
      await update(e.id, { status: 'abgeschlossen', next_action_at: null, current_step_index: nextIdx });
      return;
    }
    const nextStep = steps[nextIdx];
    let nextAt = new Date();
    if (nextStep.type === 'wait' && nextStep.wait_days) nextAt = new Date(Date.now() + nextStep.wait_days * 86400000);
    await update(e.id, { current_step_index: nextIdx, next_action_at: nextAt.toISOString() });
  };

  const confirmEmail = async () => {
    if (!draft) return;
    const { enrollment, step, steps, subject, body } = draft;
    const contactId = enrollment.contacts?.id;
    const toEmail = enrollment.contacts?.email;

    if (!toEmail) { toast.error('Kontakt hat keine E-Mail-Adresse'); return; }

    // Unsubscribe-Check
    if (contactId) {
      const { data: unsub } = await supabase.from('crm_unsubscribes')
        .select('is_unsubscribed').eq('contact_id', contactId).maybeSingle();
      if (unsub?.is_unsubscribed) {
        toast.error('Kontakt hat sich abgemeldet — E-Mail nicht gesendet');
        await supabase.from('sequence_enrollments').update({ status: 'pausiert', paused_at: new Date().toISOString() }).eq('id', enrollment.id);
        setDraft(null); void load();
        return;
      }
    }

    // Aktivität anlegen (für Tracking-Verknüpfung)
    const { data: act } = await supabase.from('crm_activities').insert({
      company_id: enrollment.companies?.id, contact_id: contactId,
      type: 'email', subject, body, owner_id: user?.id, auto_generated: true,
    }).select('id').single();

    const { data, error } = await supabase.functions.invoke('crm-send-email', {
      body: {
        to: toEmail, subject, body,
        contact_id: contactId, enrollment_id: enrollment.id,
        step_number: enrollment.current_step_index + 1,
        activity_id: act?.id,
      },
    });

    if (error || !data?.success) {
      toast.error(data?.error === 'unsubscribed' ? 'Kontakt hat sich abgemeldet' : 'E-Mail konnte nicht gesendet werden');
      return;
    }

    toast.success('E-Mail wurde gesendet');
    await supabase.from('sequence_step_executions').insert({ enrollment_id: enrollment.id, step_id: step.id, executed_by: user?.id, result: 'email_sent' });
    await advance(enrollment, steps);
    setDraft(null);
  };

  const STATUS_LABEL: Record<string, string> = { aktiv: 'Aktiv', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen', abgemeldet: 'Abgemeldet', geantwortet: 'Geantwortet' };
  const STATUS_COLOR: Record<string, string> = { aktiv: 'bg-emerald-500/15 text-emerald-400', pausiert: 'bg-amber-500/15 text-amber-400', abgeschlossen: 'bg-muted text-muted-foreground', abgemeldet: 'bg-muted text-muted-foreground', geantwortet: 'bg-blue-500/15 text-blue-400' };

  return (
    <CrmLayout>
      <h1 className="text-xl font-semibold text-foreground mb-1">Enrollments</h1>
      <p className="text-xs text-muted-foreground mb-4">Eingeschriebene Kontakte aller Sequenzen</p>

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin" /></div>
      : rows.length === 0 ? <p className="text-xs text-muted-foreground">Keine Einschreibungen.</p>
      : (
        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground tracking-wider">
              <tr>
                <th className="text-left p-2">Kontakt</th>
                <th className="text-left p-2">Unternehmen</th>
                <th className="text-left p-2">Sequenz</th>
                <th className="text-left p-2">Schritt</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Nächste Aktion</th>
                <th className="text-right p-2">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const due = r.next_action_at && new Date(r.next_action_at) <= new Date();
                return (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="p-2 text-foreground">{r.contacts ? `${r.contacts.first_name} ${r.contacts.last_name}` : '—'}</td>
                    <td className="p-2 text-muted-foreground">{r.companies?.name ?? '—'}</td>
                    <td className="p-2 text-foreground">{r.sequences?.name ?? '—'}</td>
                    <td className="p-2 text-muted-foreground tabular-nums">#{r.current_step_index + 1}</td>
                    <td className="p-2"><span className={cn('text-[10px] px-1.5 py-0.5 rounded', STATUS_COLOR[r.status])}>{STATUS_LABEL[r.status]}</span></td>
                    <td className={cn('p-2 tabular-nums', due ? 'text-amber-400 font-semibold' : 'text-muted-foreground')}>
                      {r.next_action_at ? new Date(r.next_action_at).toLocaleDateString('de-DE') : '—'}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === 'aktiv' && due && <Button size="sm" variant="outline" onClick={() => runDue(r)} className="h-6 text-[10px] gap-1"><Mail className="h-3 w-3" />Ausführen</Button>}
                        {r.status === 'aktiv' && <Button size="sm" variant="ghost" onClick={() => update(r.id, { status: 'pausiert', paused_at: new Date().toISOString() })} className="h-6 w-6 p-0"><Pause className="h-3 w-3" /></Button>}
                        {r.status === 'pausiert' && <Button size="sm" variant="ghost" onClick={() => update(r.id, { status: 'aktiv', paused_at: null })} className="h-6 w-6 p-0"><Play className="h-3 w-3" /></Button>}
                        {(r.status === 'aktiv' || r.status === 'pausiert') && <Button size="sm" variant="ghost" onClick={() => update(r.id, { status: 'abgemeldet' })} className="h-6 w-6 p-0 text-destructive"><X className="h-3 w-3" /></Button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={o => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>E-Mail-Entwurf bestätigen</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-2 text-xs">
              <p className="text-muted-foreground">An: <strong>{draft.enrollment.contacts?.email ?? '—'}</strong></p>
              <div className="p-3 rounded border border-border bg-muted/30">
                <p className="font-semibold text-foreground mb-2">{draft.subject}</p>
                <p className="whitespace-pre-wrap text-foreground">{draft.body}</p>
              </div>
              <p className="text-[11px] text-muted-foreground">Beim Bestätigen wird dein E-Mail-Programm geöffnet und die Aktivität in CRM geloggt.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)} className="h-8 text-xs">Abbrechen</Button>
            <Button size="sm" onClick={confirmEmail} className="h-8 text-xs gap-1.5"><Mail className="h-3.5 w-3.5" />Senden & Loggen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CrmLayout>
  );
}

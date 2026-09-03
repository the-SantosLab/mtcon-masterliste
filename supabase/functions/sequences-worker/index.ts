// Sequences worker — processes due steps for active enrollments.
// Automatically executed: 'task' (creates a CRM activity) and 'wait' steps.
// 'email' steps are NOT sent automatically; they stay due in /crm/outbound/enrollments
// and are dispatched manually (with preview) via crm-send-email.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const stats = { processed: 0, completed: 0, skipped_email: 0, errors: 0 };
  try {
    const nowIso = new Date().toISOString();
    const { data: enrollments } = await sb.from('sequence_enrollments')
      .select('id, sequence_id, contact_id, company_id, current_step_index, started_at, status, next_action_at, sequences!inner(status)')
      .eq('status', 'aktiv')
      .eq('sequences.status', 'aktiv')
      .lte('next_action_at', nowIso);

    for (const en of enrollments ?? []) {
      try {
        const { data: steps } = await sb.from('sequence_steps')
          .select('*').eq('sequence_id', en.sequence_id).order('order_index');
        const idx = en.current_step_index ?? 0;
        if (!steps?.length || idx >= steps.length) {
          await sb.from('sequence_enrollments').update({ status: 'abgeschlossen', completed_at: nowIso, next_action_at: null }).eq('id', en.id);
          stats.completed++;
          continue;
        }
        const step = steps[idx];

        if (step.type === 'email') { stats.skipped_email++; continue; }

        const { data: contact } = await sb.from('contacts').select('id, company_id').eq('id', en.contact_id).maybeSingle();
        const companyId = en.company_id ?? contact?.company_id ?? null;

        let result = 'waited';
        if (step.type === 'task') {
          await sb.from('crm_activities').insert({
            type: 'task',
            subject: step.task_title ?? step.subject ?? 'Sequenz-Aufgabe',
            body: step.body ?? null,
            contact_id: contact?.id ?? null,
            company_id: companyId,
            owner_id: step.task_assignee ?? null,
            due_at: nowIso,
            auto_generated: true,
          });
          result = 'task_created';
        }

        await sb.from('sequence_step_executions').insert({ enrollment_id: en.id, step_id: step.id, result });

        const nextIdx = idx + 1;
        const done = nextIdx >= steps.length;
        let nextAt: string | null = nowIso;
        if (!done) {
          const nextStep = steps[nextIdx];
          if (nextStep.type === 'wait' && nextStep.wait_days) nextAt = new Date(Date.now() + nextStep.wait_days * 86400000).toISOString();
        } else nextAt = null;

        await sb.from('sequence_enrollments').update({
          current_step_index: nextIdx,
          status: done ? 'abgeschlossen' : 'aktiv',
          completed_at: done ? nowIso : null,
          next_action_at: nextAt,
        }).eq('id', en.id);
        if (done) stats.completed++;
        stats.processed++;
      } catch (e) {
        stats.errors++;
        console.error('enrollment error', en.id, e);
      }
    }
    return new Response(JSON.stringify({ ok: true, stats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), stats }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

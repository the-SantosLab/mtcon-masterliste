// Sequences worker — processes due steps for active enrollments.
// Step types supported now: 'task' (creates case_task-like activity), 'note' (logs activity).
// 'email' steps are recorded as pending activities and require the email infra (auth-email-hook / send-transactional-email)
// to actually dispatch. The hook integration is prepared but not yet wired to an email template.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const stats = { processed: 0, completed: 0, errors: 0 };
  try {
    const { data: enrollments } = await sb.from('sequence_enrollments')
      .select('id, sequence_id, contact_id, current_step, started_at, status')
      .eq('status', 'active');

    for (const en of enrollments ?? []) {
      try {
        const { data: steps } = await sb.from('sequence_steps')
          .select('*').eq('sequence_id', en.sequence_id).order('order_index');
        if (!steps?.length) continue;
        const next = steps[en.current_step ?? 0];
        if (!next) {
          await sb.from('sequence_enrollments').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', en.id);
          stats.completed++;
          continue;
        }

        // last execution determines next due time
        const { data: lastExec } = await sb.from('sequence_step_executions')
          .select('executed_at').eq('enrollment_id', en.id).order('executed_at', { ascending: false }).limit(1).maybeSingle();
        const baseTs = lastExec?.executed_at ?? en.started_at ?? new Date().toISOString();
        const dueAt = new Date(new Date(baseTs).getTime() + (next.wait_days ?? 0) * 86400000);
        if (dueAt > new Date()) continue;

        // Resolve contact's owner/company for activity context
        const { data: contact } = await sb.from('contacts').select('id, company_id, email, first_name, last_name').eq('id', en.contact_id).maybeSingle();
        if (!contact) {
          await sb.from('sequence_enrollments').update({ status: 'failed' }).eq('id', en.id);
          continue;
        }

        let result = 'executed';
        if (next.type === 'task') {
          await sb.from('crm_activities').insert({
            type: 'task',
            subject: next.task_title ?? next.subject ?? 'Sequenz-Aufgabe',
            body: next.body ?? null,
            contact_id: contact.id,
            company_id: contact.company_id,
            owner_id: next.task_assignee ?? null,
            due_at: new Date().toISOString(),
            auto_generated: true,
          });
        } else if (next.type === 'email') {
          // Record as queued email activity. Actual send requires email infra wiring.
          await sb.from('crm_activities').insert({
            type: 'email',
            subject: next.subject ?? '(Sequenz-E-Mail)',
            body: next.body ?? null,
            contact_id: contact.id,
            company_id: contact.company_id,
            auto_generated: true,
          });
          result = 'email_queued';
        } else {
          await sb.from('crm_activities').insert({
            type: 'note',
            subject: next.subject ?? 'Sequenz-Notiz',
            body: next.body ?? null,
            contact_id: contact.id,
            company_id: contact.company_id,
            auto_generated: true,
          });
        }

        await sb.from('sequence_step_executions').insert({
          enrollment_id: en.id, step_id: next.id, result,
        });

        const nextStep = (en.current_step ?? 0) + 1;
        const done = nextStep >= steps.length;
        await sb.from('sequence_enrollments').update({
          current_step: nextStep,
          status: done ? 'completed' : 'active',
          completed_at: done ? new Date().toISOString() : null,
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

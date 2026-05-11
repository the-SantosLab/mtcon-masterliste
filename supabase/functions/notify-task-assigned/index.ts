import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, taskId, assigneeId, actorId } = await req.json();
    if (!caseId || !taskId || !assigneeId) {
      return new Response(JSON.stringify({ error: 'caseId/taskId/assigneeId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (assigneeId === actorId) {
      return new Response(JSON.stringify({ skipped: 'self_assign' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();
    const { data: c } = await admin.from('cases').select('id, case_no, project_name').eq('id', caseId).maybeSingle();
    if (!c) return new Response(JSON.stringify({ skipped: 'no_case' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: t } = await admin.from('case_tasks').select('id, title, due_at').eq('id', taskId).maybeSingle();
    if (!t) return new Response(JSON.stringify({ skipped: 'no_task' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const email = await getUserEmail(admin, assigneeId);
    if (!email) return new Response(JSON.stringify({ skipped: 'no_email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';
    const dueLine = (t as any).due_at
      ? `<p><strong>Fällig bis:</strong> ${new Date((t as any).due_at).toLocaleDateString('de-DE')}</p>`
      : '';

    const subject = `Neue Unteraufgabe zugewiesen – ${c.project_name}`;
    const html = emailLayout(
      'Neue Unteraufgabe zugewiesen',
      `<p><strong>${(t as any).title}</strong></p>
       <p>Vorgang: <strong>${c.project_name}</strong> (${c.case_no})</p>
       ${dueLine}
       <p>Zugewiesen von: ${actorName}</p>`,
      caseUrl(c.id), 'Vorgang öffnen',
    );
    const ok = await sendResendEmail(email, subject, html);
    if (ok) await logSent(admin, 'task_assigned', c.id, email);
    return new Response(JSON.stringify({ sent: ok ? 1 : 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

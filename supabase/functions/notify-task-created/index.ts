import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, taskId, actorId } = await req.json();
    if (!caseId || !taskId) {
      return new Response(JSON.stringify({ error: 'caseId/taskId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();

    const { data: c } = await admin
      .from('cases')
      .select('id, case_no, project_name, created_by, assignee_id, watchers')
      .eq('id', caseId)
      .maybeSingle();
    if (!c) return new Response(JSON.stringify({ skipped: 'no_case' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: t } = await admin.from('case_tasks').select('id, title, due_at, department_id').eq('id', taskId).maybeSingle();
    if (!t) return new Response(JSON.stringify({ skipped: 'no_task' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Recipients: creator + assignee + watchers, deduped, exclude actor
    const ids = new Set<string>();
    if ((c as any).created_by) ids.add((c as any).created_by);
    if ((c as any).assignee_id) ids.add((c as any).assignee_id);
    for (const w of ((c as any).watchers || [])) ids.add(w);
    if (actorId) ids.delete(actorId);

    if (ids.size === 0) {
      return new Response(JSON.stringify({ skipped: 'no_recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';
    const dueLine = (t as any).due_at
      ? `<p><strong>Fällig bis:</strong> ${new Date((t as any).due_at).toLocaleDateString('de-DE')}</p>`
      : '';

    const subject = `Neue Unteraufgabe – ${c.project_name}`;
    const html = emailLayout(
      'Neue Unteraufgabe angelegt',
      `<p><strong>${(t as any).title}</strong></p>
       <p>Vorgang: <strong>${c.project_name}</strong> (${c.case_no})</p>
       ${dueLine}
       <p>Angelegt von: ${actorName}</p>`,
      caseUrl(c.id), 'Vorgang öffnen',
    );

    let sent = 0;
    for (const uid of ids) {
      const email = await getUserEmail(admin, uid);
      if (!email) continue;
      const ok = await sendResendEmail(email, subject, html);
      if (ok) { sent++; await logSent(admin, 'task_created', c.id, email); }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

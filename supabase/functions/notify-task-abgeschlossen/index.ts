import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, taskId, actorId } = await req.json();
    if (!caseId || !taskId) {
      return new Response(JSON.stringify({ error: 'caseId/taskId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();
    const { data: c } = await admin.from('cases').select('id, case_no, project_name, watchers').eq('id', caseId).maybeSingle();
    if (!c) return new Response(JSON.stringify({ skipped: 'no_case' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const watchers: string[] = (c.watchers as string[]) || [];
    if (watchers.length === 0) return new Response(JSON.stringify({ skipped: 'no_watchers' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: t } = await admin.from('case_tasks').select('id, title').eq('id', taskId).maybeSingle();
    const taskTitle = (t?.title as string) || 'Aufgabe';
    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';

    const subject = `Update: Aufgabe in '${c.project_name}' abgeschlossen`;
    let sentCount = 0;
    for (const uid of watchers) {
      if (actorId && uid === actorId) continue;
      const email = await getUserEmail(admin, uid);
      if (!email) continue;
      const html = emailLayout(
        'Aufgabe abgeschlossen',
        `<p>${actorName} hat die Aufgabe <strong>${taskTitle}</strong> im Vorgang <strong>${c.project_name}</strong> (${c.case_no}) abgeschlossen.</p>`,
        caseUrl(c.id), 'Vorgang öffnen',
      );
      const ok = await sendResendEmail(email, subject, html);
      if (ok) { await logSent(admin, 'task_abgeschlossen', c.id, email); sentCount++; }
    }
    return new Response(JSON.stringify({ sent: sentCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

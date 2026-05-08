import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, actorId } = await req.json();
    if (!caseId) {
      return new Response(JSON.stringify({ error: 'caseId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();
    const { data: c } = await admin.from('cases').select('id, case_no, project_name, created_by').eq('id', caseId).maybeSingle();
    if (!c || !c.created_by) return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (actorId && actorId === c.created_by) return new Response(JSON.stringify({ skipped: 'self' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const email = await getUserEmail(admin, c.created_by);
    if (!email) return new Response(JSON.stringify({ skipped: 'no_email' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';

    const subject = `[${c.case_no}] wurde abgeholt`;
    const html = emailLayout(
      'Vorgang wurde abgeholt',
      `<p>${actorName} hat deinen Vorgang <strong>${c.project_name}</strong> (${c.case_no}) abgeholt und in Bearbeitung genommen.</p>`,
      caseUrl(c.id), 'Vorgang öffnen',
    );
    const ok = await sendResendEmail(email, subject, html);
    if (ok) await logSent(admin, 'abgeholt', c.id, email);
    return new Response(JSON.stringify({ sent: ok }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

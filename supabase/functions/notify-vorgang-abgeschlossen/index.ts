import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, actorId, note } = await req.json();
    if (!caseId) {
      return new Response(JSON.stringify({ error: 'caseId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();
    const { data: c } = await admin.from('cases').select('id, case_no, project_name, created_by, assignee_id, watchers').eq('id', caseId).maybeSingle();
    if (!c) return new Response(JSON.stringify({ skipped: 'no_case' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const recipients = new Set<string>();
    if (c.created_by && c.created_by !== actorId) recipients.add(c.created_by as string);
    if (c.assignee_id && c.assignee_id !== actorId) recipients.add(c.assignee_id as string);
    for (const w of (c.watchers as string[] | null) || []) {
      if (w && w !== actorId) recipients.add(w);
    }
    if (recipients.size === 0) {
      return new Response(JSON.stringify({ skipped: 'no_recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';
    const noteHtml = note && String(note).trim() ? `<p><strong>Abschlussnotiz:</strong><br/>${String(note).replace(/[<>]/g, '')}</p>` : '';
    const subject = `Vorgang abgeschlossen – ${c.project_name}`;

    let sentCount = 0;
    for (const uid of recipients) {
      const email = await getUserEmail(admin, uid);
      if (!email) continue;
      const html = emailLayout(
        'Vorgang abgeschlossen',
        `<p>${actorName} hat den Vorgang <strong>${c.project_name}</strong> (${c.case_no}) abgeschlossen.</p>${noteHtml}`,
        caseUrl(c.id), 'Vorgang öffnen',
      );
      const ok = await sendResendEmail(email, subject, html);
      if (ok) { await logSent(admin, 'vorgang_abgeschlossen', c.id, email); sentCount++; }
    }
    return new Response(JSON.stringify({ sent: sentCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

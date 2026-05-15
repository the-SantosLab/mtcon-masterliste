import { corsHeaders, adminClient, getUserEmail, getDisplayName, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { caseId, actorId } = await req.json();
    if (!caseId) {
      return new Response(JSON.stringify({ error: 'caseId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const admin = adminClient();

    const { data: c } = await admin
      .from('cases')
      .select('id, case_no, project_name, created_by, assignee_id, department_id, due_at')
      .eq('id', caseId)
      .maybeSingle();
    if (!c) return new Response(JSON.stringify({ skipped: 'no_case' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Build recipients
    const ids = new Set<string>();
    if ((c as any).assignee_id) {
      // direct assignee gets it
      ids.add((c as any).assignee_id);
    } else if ((c as any).department_id) {
      // notify all members of the target department
      const { data: members } = await admin
        .from('department_members')
        .select('user_id')
        .eq('department_id', (c as any).department_id);
      for (const m of (members as any[]) || []) ids.add(m.user_id);
      // also dept manager
      const { data: dept } = await admin
        .from('departments')
        .select('manager_user_id')
        .eq('id', (c as any).department_id)
        .maybeSingle();
      if ((dept as any)?.manager_user_id) ids.add((dept as any).manager_user_id);
    }
    if (actorId) ids.delete(actorId);

    if (ids.size === 0) {
      return new Response(JSON.stringify({ skipped: 'no_recipients' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const actorName = actorId ? await getDisplayName(admin, actorId) : 'Ein Benutzer';
    const dueLine = (c as any).due_at
      ? `<p><strong>Endtermin:</strong> ${new Date((c as any).due_at).toLocaleDateString('de-DE')}</p>`
      : '';
    const audience = (c as any).assignee_id
      ? '<p>Du wurdest als Bearbeiter zugewiesen.</p>'
      : '<p>Der Vorgang liegt aktuell ohne Bearbeiter in deiner Abteilung.</p>';

    const subject = `Neuer Vorgang – ${c.project_name} (${c.case_no})`;
    const html = emailLayout(
      'Neuer Vorgang angelegt',
      `<p><strong>${c.project_name}</strong> (${c.case_no})</p>
       ${dueLine}
       ${audience}
       <p>Angelegt von: ${actorName}</p>`,
      caseUrl(c.id), 'Vorgang öffnen',
    );

    let sent = 0;
    for (const uid of ids) {
      const email = await getUserEmail(admin, uid);
      if (!email) continue;
      const ok = await sendResendEmail(email, subject, html);
      if (ok) { sent++; await logSent(admin, 'vorgang_created', c.id, email); }
    }

    return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

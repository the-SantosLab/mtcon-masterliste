import { corsHeaders, adminClient, getUserEmail, sendResendEmail, emailLayout, logSent, caseUrl } from '../_shared/email-helpers.ts';

const ACTIVE_STATUSES = ['nicht_begonnen', 'in_planung', 'in_arbeit', 'in_verzug', 'ready_for_review', 'blocked'];

function addDays(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

async function processOffset(admin: ReturnType<typeof adminClient>, days: number, type: 'deadline_7d' | 'deadline_3d') {
  const target = addDays(days);
  const { data: cases, error } = await admin
    .from('cases')
    .select('id, case_no, project_name, due_at, assignee_id')
    .eq('due_at', target)
    .in('status', ACTIVE_STATUSES)
    .not('assignee_id', 'is', null);
  if (error) { console.error(error); return 0; }

  let sent = 0;
  for (const c of cases || []) {
    const email = await getUserEmail(admin, c.assignee_id as string);
    if (!email) continue;
    const urgent = days === 3;
    const subject = urgent
      ? `⚠️ Dringend: '${c.project_name}' endet in 3 Tagen`
      : `Erinnerung: '${c.project_name}' endet in 7 Tagen`;
    const intro = urgent
      ? `<p><strong>Dringende Erinnerung:</strong> Dein Vorgang <strong>${c.project_name}</strong> (${c.case_no}) hat noch <strong>3 Tage</strong> bis zum Endtermin (${c.due_at}). Bitte priorisieren.</p>`
      : `<p>Dein Vorgang <strong>${c.project_name}</strong> (${c.case_no}) hat noch <strong>7 Tage</strong> bis zum Endtermin (${c.due_at}).</p>`;
    const html = emailLayout(urgent ? 'Endtermin in 3 Tagen' : 'Endtermin in 7 Tagen', intro, caseUrl(c.id as string), 'Vorgang öffnen');
    const ok = await sendResendEmail(email, subject, html);
    if (ok) { await logSent(admin, type, c.id as string, email); sent++; }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const admin = adminClient();
    const sent7 = await processOffset(admin, 7, 'deadline_7d');
    const sent3 = await processOffset(admin, 3, 'deadline_3d');
    return new Response(JSON.stringify({ sent_7d: sent7, sent_3d: sent3 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

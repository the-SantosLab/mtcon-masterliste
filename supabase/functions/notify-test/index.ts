import { corsHeaders, sendResendEmail, emailLayout, adminClient, logSent } from '../_shared/email-helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { to = 'js@santoslab.de' } = await req.json().catch(() => ({}));
    const html = emailLayout(
      'Testnachricht: Vorgang wurde abgeholt',
      `<p>Dies ist eine Test-Email aus dem KS Command Benachrichtigungssystem.</p>
       <p>Beispielmeldung: <strong>Mario Tolj</strong> hat deinen Vorgang <strong>Beispielprojekt</strong> (VOR-2026-9999) abgeholt und in Bearbeitung genommen.</p>`,
      'https://mtcon.kscommand.com', 'Zur Anwendung',
    );
    const ok = await sendResendEmail(to, '[VOR-2026-9999] wurde abgeholt (TEST)', html);
    if (ok) {
      try { await logSent(adminClient(), 'abgeholt', null, to); } catch {}
    }
    return new Response(JSON.stringify({ sent: ok, to }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

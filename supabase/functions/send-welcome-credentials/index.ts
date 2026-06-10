import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const { email, password, login_url, user_id } = await req.json();
  const ALLOWED = [
    'js@santoslab.de',
    'anja.magnussen@mtcon.eu','marco.tolj@mtcon.eu','marvin.beug@mtcon.eu',
    'vivien.sirca@mtcon.eu','natalie.lutz@mtcon.eu','marcel.santana@mtcon.eu',
    'michele.richter@mtcon.eu','pascal.petreski@mtcon.eu',
    'ann-christine.gaeckle@mtcon.eu',
  ];
  if (!email || !password || !user_id || !ALLOWED.includes(String(email).toLowerCase())) {
    return new Response(JSON.stringify({ error: 'not allowed' }), { status: 403, headers: corsHeaders });
  }

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPA_URL, SRK);
  const userId = user_id as string;

  const putRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { 'apikey': SRK, 'Authorization': `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    return new Response(JSON.stringify({ error: 'updateUser fehlgeschlagen', detail: t }), { status: 500, headers: corsHeaders });
  }

  const url = login_url || 'https://mtcon.kscommand.com';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1a1a1a;background:#ffffff;">
      <h2 style="font-size:18px;font-weight:600;margin:0 0 12px;">Willkommen bei der MTCON Masterliste</h2>
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0 0 20px;">
        Dein Zugang wurde eingerichtet. Du kannst dich ab sofort mit den folgenden Zugangsdaten anmelden:
      </p>
      <table style="font-size:14px;border-collapse:collapse;margin:0 0 20px;">
        <tr><td style="padding:6px 12px 6px 0;color:#666;">E-Mail</td><td style="padding:6px 0;font-weight:600;">${email}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#666;">Passwort</td><td style="padding:6px 0;font-family:monospace;font-weight:600;">${password}</td></tr>
      </table>
      <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">Zur Anmeldung</a>
      <p style="font-size:12px;color:#888;line-height:1.5;margin:24px 0 0;">
        Bitte ändere dein Passwort nach der ersten Anmeldung im Profilbereich.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0 12px;" />
      <p style="font-size:11px;color:#bbb;margin:0;">Masterliste · MTCON</p>
    </div>`;

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return new Response(JSON.stringify({ error: 'RESEND_API_KEY fehlt' }), { status: 500, headers: corsHeaders });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Masterliste <noreply@kscommand.com>',
      to: [email],
      subject: 'Willkommen bei der MTCON Masterliste – Deine Zugangsdaten',
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return new Response(JSON.stringify({ error: 'Resend Fehler: ' + t }), { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true, user_id: userId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

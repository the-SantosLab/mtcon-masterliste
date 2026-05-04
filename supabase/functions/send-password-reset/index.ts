import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { email, redirectTo } = await req.json();

  if (!email) {
    return new Response(JSON.stringify({ error: 'E-Mail fehlt' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Rate limit: 1 request per email per 5 minutes (uses counters table as a tiny store)
  const normalizedEmail = String(email).trim().toLowerCase().slice(0, 254);
  const rateKey = `pwreset:${normalizedEmail}`;
  const { data: existing } = await supabaseAdmin
    .from('counters')
    .select('value, key')
    .eq('key', rateKey)
    .maybeSingle();
  const nowSec = Math.floor(Date.now() / 1000);
  if (existing && nowSec - (existing.value as number) < 300) {
    // Don't reveal abuse — return generic success
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  await supabaseAdmin
    .from('counters')
    .upsert({ key: rateKey, value: nowSec }, { onConflict: 'key' });

  // Generate the recovery link via admin API
  // redirectTo must be the published app URL so Supabase redirects correctly
  const finalRedirectTo = redirectTo || 'https://mtcon.kscommand.com/reset-password';
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: finalRedirectTo },
  });

  if (error || !data?.properties?.action_link) {
    // Don't reveal if user exists or not
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const resetLink = data.properties.action_link;
  const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

  // Send via Resend
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Masterliste <noreply@kscommand.com>',
      to: [email],
      subject: 'Passwort zurücksetzen – Masterliste',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
          <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 8px;">Passwort zurücksetzen</h2>
          <p style="font-size: 14px; color: #555; margin: 0 0 24px; line-height: 1.5;">
            Du hast eine Anfrage zum Zurücksetzen deines Passworts erhalten. Klicke auf den Button unten, um ein neues Passwort zu vergeben.
          </p>
          <a href="${resetLink}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Passwort zurücksetzen
          </a>
          <p style="font-size: 12px; color: #999; margin: 24px 0 0; line-height: 1.5;">
            Dieser Link ist 1 Stunde gültig. Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 11px; color: #bbb; margin: 0;">Masterliste · MTCON</p>
        </div>
      `,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json();
    console.error('Resend error:', err);
    return new Response(JSON.stringify({ error: 'E-Mail konnte nicht gesendet werden' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

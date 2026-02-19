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

  // Generate the recovery link via admin API
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: redirectTo || `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '')}/reset-password` },
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
      from: 'KS Command <noreply@kscommand.com>',
      to: [email],
      subject: 'Passwort zurücksetzen – KS Command',
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
          <p style="font-size: 11px; color: #bbb; margin: 0;">KS Command · MTCON</p>
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

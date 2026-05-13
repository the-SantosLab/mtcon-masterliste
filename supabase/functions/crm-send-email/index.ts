import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_URL = 'https://mtcon.kscommand.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { to, subject, body, contact_id, enrollment_id, step_number, activity_id } = await req.json();

    if (!to || !subject) {
      return new Response(JSON.stringify({ success: false, error: 'to and subject required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Server-side unsubscribe guard
    if (contact_id) {
      const { data: unsub } = await admin.from('crm_unsubscribes')
        .select('is_unsubscribed').eq('contact_id', contact_id).maybeSingle();
      if (unsub?.is_unsubscribed) {
        return new Response(JSON.stringify({ success: false, error: 'unsubscribed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a1a;background:#fff;">
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body ?? '')}</div>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px;" />
      <p style="font-size:11px;color:#999;margin:0;">Möchten Sie keine weiteren E-Mails erhalten? <a href="${APP_URL}/crm/unsubscribe?c=${contact_id ?? ''}" style="color:#999;">Abmelden</a></p>
    </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'MTCON <noreply@kscommand.com>', to: [to], subject, html }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Resend failed', text);
      return new Response(JSON.stringify({ success: false, error: text }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const result = await res.json();
    const provider_message_id = result?.id ?? null;

    await admin.from('crm_email_tracking').insert({
      activity_id: activity_id ?? null,
      enrollment_id: enrollment_id ?? null,
      contact_id: contact_id ?? null,
      to_email: to, subject, provider_message_id,
      status: 'sent', step_number: step_number ?? null,
    });

    return new Response(JSON.stringify({ success: true, provider_message_id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

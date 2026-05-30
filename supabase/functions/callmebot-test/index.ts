// Sends a test WhatsApp message via CallMeBot. Admin-only.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RECIPIENTS: Array<{ phone: string; apikey: string }> = [
  { phone: '+4915239601825', apikey: '4396290' },
  { phone: '+4916092420656', apikey: '2459823' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleRow } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden – Admins only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
    const text = `[MTCON] Test-Benachrichtigung\nCallMeBot Integration aktiv\n${now}`;

    const results = await Promise.all(RECIPIENTS.map(async (r) => {
      try {
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(r.phone)}&apikey=${r.apikey}&text=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const body = await res.text();
        return { phone: r.phone, ok: res.ok, status: res.status, body: body.slice(0, 300) };
      } catch (e: any) {
        return { phone: r.phone, ok: false, status: 0, body: e?.message || String(e) };
      }
    }));

    const allOk = results.every((x) => x.ok);
    return new Response(JSON.stringify({ ok: allOk, results }), {
      status: allOk ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const ip = req.headers.get('x-forwarded-for') ?? '';
  const ua = req.headers.get('user-agent') ?? '';
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? (req.method === 'POST' ? (await req.clone().json()).token : null);
    if (!token) return j({ error: 'missing token' }, 400);

    const { data: tok } = await sb.from('offer_share_tokens').select('*').eq('token', token).maybeSingle();
    if (!tok) return j({ error: 'invalid token' }, 404);
    if (tok.revoked_at) return j({ error: 'token revoked' }, 410);
    if (tok.expires_at && new Date(tok.expires_at) < new Date()) return j({ error: 'token expired' }, 410);

    if (req.method === 'GET') {
      const { data: offer } = await sb.from('offers').select('id,offer_no,total,valid_until,status,notes,payment_terms,version,accepted_at,rejected_at,company_id,primary_contact_id').eq('id', tok.offer_id).maybeSingle();
      const { data: items } = await sb.from('offer_items').select('*').eq('offer_id', tok.offer_id).order('sort_order');
      const { data: company } = offer?.company_id ? await sb.from('companies').select('name').eq('id', offer.company_id).maybeSingle() : { data: null };
      await sb.from('offer_events').insert({ offer_id: tok.offer_id, event_type: 'viewed', ip_address: ip, user_agent: ua });
      return j({ offer, items: items ?? [], company });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { action, actor_name, actor_email, comment, signature_data } = body;
      if (!['accept', 'reject'].includes(action)) return j({ error: 'invalid action' }, 400);
      if (!actor_name || !actor_email) return j({ error: 'name & email required' }, 400);

      const update = action === 'accept'
        ? { accepted_at: new Date().toISOString(), status: 'accepted' }
        : { rejected_at: new Date().toISOString(), status: 'rejected' };
      await sb.from('offers').update(update).eq('id', tok.offer_id);
      await sb.from('offer_events').insert({
        offer_id: tok.offer_id,
        event_type: action === 'accept' ? 'accepted' : 'rejected',
        actor_name, actor_email, comment, signature_data, ip_address: ip, user_agent: ua,
      });
      return j({ ok: true });
    }
    return j({ error: 'method not allowed' }, 405);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
  function j(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

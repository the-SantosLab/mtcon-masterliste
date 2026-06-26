import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);
    const slug = url.pathname.split('/').filter(Boolean).pop();
    const body = await req.json().catch(() => ({}));

    const { data: ep } = await sb.from('crm_web_form_endpoints').select('*').eq('slug', slug).maybeSingle();
    if (!ep || !ep.is_active) return j({ error: 'endpoint not found' }, 404);

    // Honeypot
    if (ep.honeypot_field && body[ep.honeypot_field]) return j({ ok: true });

    // Origin check (if configured)
    if (ep.allowed_origins?.length) {
      const origin = req.headers.get('origin') ?? '';
      if (!ep.allowed_origins.includes(origin)) return j({ error: 'origin not allowed' }, 403);
    }

    const { company_name, contact_name, email, phone, website, country, industry, notes, message } = body;
    if (!email && !contact_name && !company_name) return j({ error: 'missing required fields' }, 400);

    const { data: lead, error } = await sb.from('leads').insert({
      company_name: company_name ?? '(unbekannt)',
      contact_name, email, phone, website, country, industry,
      notes: notes ?? message ?? null,
      source: ep.default_source ?? 'website',
      status: 'new',
      assigned_to: ep.default_owner_id ?? null,
    }).select().single();
    if (error) return j({ error: error.message }, 500);

    // Optional consent record if user opted in via form
    if (email && body.email_opt_in) {
      await sb.from('crm_consent_log').insert({
        email, consent_type: 'marketing', action: 'opt_in',
        source: `web_form:${slug}`,
        ip_address: req.headers.get('x-forwarded-for') ?? '',
        user_agent: req.headers.get('user-agent') ?? '',
      });
    }

    return j({ ok: true, lead_id: lead.id, redirect_url: ep.redirect_url ?? null });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
  function j(b: unknown, s = 200) {
    return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

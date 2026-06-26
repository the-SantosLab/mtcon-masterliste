// Microsoft 365 sync — reads credentials from secrets OR public.integration_settings (id='ms365').
// Required values: tenant_id, client_id, client_secret (admin consent for Graph .default scope).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Creds = { tenant_id: string; client_id: string; client_secret: string };

async function loadCreds(): Promise<{ creds: Creds | null; source: 'env' | 'db' | 'none'; missing: string[] }> {
  const envTenant = Deno.env.get('MS_GRAPH_TENANT_ID');
  const envCid = Deno.env.get('MS_GRAPH_CLIENT_ID');
  const envSec = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  if (envTenant && envCid && envSec) {
    return { creds: { tenant_id: envTenant, client_id: envCid, client_secret: envSec }, source: 'env', missing: [] };
  }
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data } = await sb.from('integration_settings').select('config').eq('id', 'ms365').maybeSingle();
    const c = (data?.config ?? {}) as Partial<Creds>;
    if (c.tenant_id && c.client_id && c.client_secret) {
      return { creds: c as Creds, source: 'db', missing: [] };
    }
    const missing = [
      !c.tenant_id && 'tenant_id',
      !c.client_id && 'client_id',
      !c.client_secret && 'client_secret',
    ].filter(Boolean) as string[];
    return { creds: null, source: 'none', missing };
  } catch {
    return { creds: null, source: 'none', missing: ['tenant_id', 'client_id', 'client_secret'] };
  }
}

async function getToken(c: Creds): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant_id}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.client_id,
      client_secret: c.client_secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token failed (${res.status}): ${text}`);
  return JSON.parse(text).access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const { creds, source, missing } = await loadCreds();
  if (!creds) {
    return new Response(JSON.stringify({
      configured: false,
      source,
      missing,
      hint: 'Trage Tenant ID, Client ID und Client Secret unter /crm/settings/microsoft-365 ein.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'ping';
    const token = await getToken(creds);
    return new Response(JSON.stringify({ configured: true, source, action, token_acquired: !!token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ configured: true, source, error: String(e instanceof Error ? e.message : e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

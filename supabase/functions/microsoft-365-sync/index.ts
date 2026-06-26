// Microsoft 365 sync scaffold — ready for OAuth credentials.
// Required secrets (add via Lovable secrets):
//   MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET
// Uses client-credentials flow against https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
// Scopes: https://graph.microsoft.com/.default (mail/calendar read once admin consent is granted).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TENANT = Deno.env.get('MS_GRAPH_TENANT_ID');
const CID = Deno.env.get('MS_GRAPH_CLIENT_ID');
const CSEC = Deno.env.get('MS_GRAPH_CLIENT_SECRET');

async function getToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CID!, client_secret: CSEC!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`token failed: ${res.status}`);
  const j = await res.json();
  return j.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!TENANT || !CID || !CSEC) {
    return new Response(JSON.stringify({
      configured: false,
      missing: [!TENANT && 'MS_GRAPH_TENANT_ID', !CID && 'MS_GRAPH_CLIENT_ID', !CSEC && 'MS_GRAPH_CLIENT_SECRET'].filter(Boolean),
      hint: 'Set these secrets in Lovable to enable Microsoft 365 sync.',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'ping';
    const token = await getToken();
    if (action === 'ping') {
      return new Response(JSON.stringify({ configured: true, token_acquired: !!token }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, action }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

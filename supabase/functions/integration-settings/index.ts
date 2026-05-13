// Verwaltung von integration_settings (Admin-only).
// GET-artig: liefert Config mit MASKIERTEN Secret-Werten.
// POST-artig: speichert Config; leere Secret-Felder werden ignoriert (bestehender Wert bleibt).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const j = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Felder, deren Wert beim Auslesen niemals im Klartext zurückgegeben wird.
const SECRET_FIELDS_BY_INTEGRATION: Record<string, string[]> = {
  personio: ['client_secret'],
};

const ALLOWED_INTEGRATIONS = new Set(Object.keys(SECRET_FIELDS_BY_INTEGRATION));

function maskValue(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0) return '';
  if (v.length <= 4) return '••••';
  return '••••' + v.slice(-4);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return j(401, { error: 'Unauthorized' });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: { user } } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return j(401, { error: 'Unauthorized' });
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (!roleRow) return j(403, { error: 'Forbidden – Admins only' });

  let body: { action?: 'get' | 'save'; integration_id?: string; config?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { /* */ }
  const action = body.action || 'get';
  const integrationId = String(body.integration_id || '').toLowerCase();
  if (!ALLOWED_INTEGRATIONS.has(integrationId)) {
    return j(400, { error: 'Unbekannte Integration' });
  }
  const secretFields = SECRET_FIELDS_BY_INTEGRATION[integrationId];

  if (action === 'get') {
    const { data, error } = await admin
      .from('integration_settings').select('config, updated_at, updated_by')
      .eq('id', integrationId).maybeSingle();
    if (error) return j(500, { error: error.message });
    const cfg = (data?.config as Record<string, unknown>) || {};
    const masked: Record<string, unknown> = {};
    const has: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(cfg)) {
      if (secretFields.includes(k)) {
        has[k] = typeof v === 'string' && v.length > 0;
        masked[k] = has[k] ? maskValue(v) : '';
      } else {
        masked[k] = v;
      }
    }
    return j(200, {
      integration_id: integrationId,
      config: masked,
      has_secrets: has,
      updated_at: data?.updated_at || null,
      updated_by: data?.updated_by || null,
      configured: Object.keys(cfg).length > 0,
    });
  }

  if (action === 'save') {
    const incoming = (body.config && typeof body.config === 'object') ? body.config : {};
    // bestehende Config laden, um leer gelassene Secret-Felder zu erhalten
    const { data: existing } = await admin
      .from('integration_settings').select('config').eq('id', integrationId).maybeSingle();
    const prev = (existing?.config as Record<string, unknown>) || {};

    const merged: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(incoming)) {
      if (secretFields.includes(k)) {
        if (typeof v === 'string' && v.trim().length > 0) {
          merged[k] = v.trim();
        }
      } else if (v === '' || v === null || v === undefined) {
        delete merged[k];
      } else {
        merged[k] = typeof v === 'string' ? v.trim() : v;
      }
    }

    const { error: upErr } = await admin.from('integration_settings').upsert({
      id: integrationId,
      config: merged,
      updated_by: user.id,
    });
    if (upErr) return j(500, { error: upErr.message });

    return j(200, { ok: true });
  }

  return j(400, { error: 'Unbekannte Aktion' });
});

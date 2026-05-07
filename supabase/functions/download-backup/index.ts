import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: claims } = await userClient.auth.getClaims(token);
  if (!claims?.claims) return json({ error: 'Unauthorized' }, 401);
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', claims.claims.sub).eq('role', 'admin').maybeSingle();
  if (!roleRow) return json({ error: 'Forbidden' }, 403);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);

  const { data: backup, error } = await admin.from('backups').select('storage_path').eq('id', id).single();
  if (error || !backup?.storage_path) return json({ error: 'Backup nicht gefunden' }, 404);

  const { data: signed, error: sErr } = await admin.storage.from('backups').createSignedUrl(backup.storage_path, 300);
  if (sErr || !signed) return json({ error: 'Signed URL Fehler' }, 500);

  return json({ url: signed.signedUrl });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

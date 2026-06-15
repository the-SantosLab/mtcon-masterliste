import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify calling user is admin
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleData) {
    return new Response(JSON.stringify({ error: 'Forbidden – Admins only' }), { status: 403, headers: corsHeaders });
  }

  let body: { user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }
  const { user_id } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id ist erforderlich' }), {
      status: 400, headers: corsHeaders,
    });
  }

  // List all MFA factors of the target user and delete every one of them.
  const { data: factorsList, error: listErr } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: user_id });
  if (listErr) {
    return new Response(JSON.stringify({ error: listErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const factors = factorsList?.factors ?? [];
  let removed = 0;
  for (const f of factors) {
    const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: user_id, id: f.id });
    if (!delErr) removed++;
  }

  return new Response(JSON.stringify({ success: true, removed, total: factors.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

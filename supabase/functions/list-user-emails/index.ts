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
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }
  const token = authHeader.replace('Bearer ', '');

  // Admin client for user validation, role check + listUsers.
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  if (!token || token === 'undefined' || token === 'null') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const { data: claimsData, error: claimsErr } = await supabaseAdmin.auth.getClaims(token);
  const userId = claimsData?.claims?.sub as string | undefined;
  if (claimsErr || !userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: roleData } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'staff']);
  if (!roleData || roleData.length === 0) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });
  }

  const emails: Record<string, string> = {};
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error || !users || users.length === 0) break;
    for (const u of users) {
      if (u.email) emails[u.id] = u.email;
    }
    if (users.length < perPage) break;
    page++;
  }

  return new Response(JSON.stringify(emails), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

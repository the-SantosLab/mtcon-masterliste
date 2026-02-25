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

  const { user_id, new_password } = await req.json();
  if (!user_id || !new_password) {
    return new Response(JSON.stringify({ error: 'user_id und new_password sind erforderlich' }), {
      status: 400, headers: corsHeaders,
    });
  }

  if (new_password.length < 8) {
    return new Response(JSON.stringify({ error: 'Passwort muss mindestens 8 Zeichen lang sein' }), {
      status: 400, headers: corsHeaders,
    });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

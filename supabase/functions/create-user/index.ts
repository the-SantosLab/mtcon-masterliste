import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify calling user is an admin
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Check calling user is admin
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

  const { email, display_name, short_code, role, department_id } = await req.json();

  if (!email || !display_name || !short_code) {
    return new Response(JSON.stringify({ error: 'email, display_name und short_code sind Pflichtfelder' }), {
      status: 400, headers: corsHeaders,
    });
  }

  // Create the auth user with a random password (they will use password reset)
  const tempPassword = crypto.randomUUID();
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { display_name, short_code },
  });

  if (createError) {
    return new Response(JSON.stringify({ error: createError.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const newUserId = created.user.id;

  // Upsert profile (trigger also creates one, but we want display_name + short_code correct)
  await supabaseAdmin.from('users_profile').upsert({
    id: newUserId,
    display_name,
    short_code,
    department_id: department_id || null,
    active: true,
  });

  // Set role
  await supabaseAdmin.from('user_roles').upsert({
    user_id: newUserId,
    role: role || 'staff',
  }, { onConflict: 'user_id,role' });

  // Send password reset so the user can set their own password
  await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
  });

  return new Response(JSON.stringify({ id: newUserId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

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

  const { user_id } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id ist erforderlich' }), { status: 400, headers: corsHeaders });
  }

  // Prevent self-deletion
  if (user_id === user.id) {
    return new Response(JSON.stringify({ error: 'Sie können sich nicht selbst löschen' }), { status: 400, headers: corsHeaders });
  }

  // Delete related data first (order matters for FK constraints)
  await supabaseAdmin.from('notifications').delete().eq('user_id', user_id);
  await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id);
  await supabaseAdmin.from('user_preferences').delete().eq('user_id', user_id);
  await supabaseAdmin.from('project_members').delete().eq('user_id', user_id);

  // Unassign cases
  await supabaseAdmin.from('cases').update({ assignee_id: null }).eq('assignee_id', user_id);

  // Delete profile
  const { error: profileErr } = await supabaseAdmin.from('users_profile').delete().eq('id', user_id);
  if (profileErr) {
    return new Response(JSON.stringify({ error: 'Profil konnte nicht gelöscht werden: ' + profileErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Delete auth user
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
  if (authErr) {
    return new Response(JSON.stringify({ error: 'Auth-User konnte nicht gelöscht werden: ' + authErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

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

  // Null out FK references to this user across all tables
  await supabaseAdmin.from('cases').update({ assignee_id: null }).eq('assignee_id', user_id);
  await supabaseAdmin.from('cases').update({ created_by: null }).eq('created_by', user_id);
  await supabaseAdmin.from('cases').update({ closed_by: null }).eq('closed_by', user_id);
  await supabaseAdmin.from('cases').update({ last_changed_by: null }).eq('last_changed_by', user_id);
  await supabaseAdmin.from('cases').update({ due_date_corrected_by: null }).eq('due_date_corrected_by', user_id);
  await supabaseAdmin.from('cases').update({ secondary_check_by: null }).eq('secondary_check_by', user_id);

  await supabaseAdmin.from('case_tasks').update({ assigned_to: null }).eq('assigned_to', user_id);
  await supabaseAdmin.from('case_tasks').update({ completed_by: null }).eq('completed_by', user_id);
  await supabaseAdmin.from('case_tasks').update({ created_by: null as any }).eq('created_by', user_id);

  await supabaseAdmin.from('projects').update({ owner_id: null }).eq('owner_id', user_id);
  await supabaseAdmin.from('projects').update({ created_by: null as any }).eq('created_by', user_id);

  await supabaseAdmin.from('departments').update({ manager_user_id: null }).eq('manager_user_id', user_id);
  await supabaseAdmin.from('users_profile').update({ manager_id: null }).eq('manager_id', user_id);
  await supabaseAdmin.from('support_tickets').update({ assigned_to: null }).eq('assigned_to', user_id);

  // Activity log entries reference the actor — delete them since actor_id is NOT NULL
  await supabaseAdmin.from('case_activity').delete().eq('actor_id', user_id);
  await supabaseAdmin.from('project_activity').delete().eq('actor_id', user_id);

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

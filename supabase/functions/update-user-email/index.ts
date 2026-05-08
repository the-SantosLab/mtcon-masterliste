import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { oldEmail, newEmail, deleteConflicting } = await req.json();
    if (!oldEmail || !newEmail) return json({ error: 'Missing oldEmail/newEmail' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return json({ error: listErr.message }, 500);

    const oldUser = list.users.find((u: any) => u.email?.toLowerCase() === oldEmail.toLowerCase());
    if (!oldUser) return json({ error: 'Old user not found' }, 404);

    const conflict = list.users.find((u: any) => u.email?.toLowerCase() === newEmail.toLowerCase());
    if (conflict && deleteConflicting) {
      const cid = conflict.id;
      await admin.from('notifications').delete().eq('user_id', cid);
      await admin.from('user_roles').delete().eq('user_id', cid);
      await admin.from('user_preferences').delete().eq('user_id', cid);
      await admin.from('project_members').delete().eq('user_id', cid);
      await admin.from('cases').update({ assignee_id: null }).eq('assignee_id', cid);
      await admin.from('cases').update({ created_by: null }).eq('created_by', cid);
      await admin.from('cases').update({ closed_by: null }).eq('closed_by', cid);
      await admin.from('cases').update({ last_changed_by: null }).eq('last_changed_by', cid);
      await admin.from('cases').update({ due_date_corrected_by: null }).eq('due_date_corrected_by', cid);
      await admin.from('cases').update({ secondary_check_by: null }).eq('secondary_check_by', cid);
      await admin.from('case_tasks').update({ assigned_to: null }).eq('assigned_to', cid);
      await admin.from('case_tasks').update({ completed_by: null }).eq('completed_by', cid);
      await admin.from('case_tasks').update({ created_by: null as any }).eq('created_by', cid);
      await admin.from('projects').update({ owner_id: null }).eq('owner_id', cid);
      await admin.from('projects').update({ created_by: null as any }).eq('created_by', cid);
      await admin.from('departments').update({ manager_user_id: null }).eq('manager_user_id', cid);
      await admin.from('users_profile').update({ manager_id: null }).eq('manager_id', cid);
      await admin.from('support_tickets').update({ assigned_to: null }).eq('assigned_to', cid);
      await admin.from('case_activity').delete().eq('actor_id', cid);
      await admin.from('project_activity').delete().eq('actor_id', cid);
      await admin.from('users_profile').delete().eq('id', cid);
      const { error: delErr } = await admin.auth.admin.deleteUser(cid);
      if (delErr) return json({ error: 'Delete conflict failed: ' + delErr.message }, 500);
    } else if (conflict) {
      return json({ error: 'Conflict exists', conflictId: conflict.id }, 409);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(oldUser.id, { email: newEmail, email_confirm: true });
    if (updErr) {
      console.error('Update error:', updErr);
      return json({ error: updErr.message }, 500);
    }

    return json({ success: true, userId: oldUser.id, newEmail, deletedConflict: !!conflict });
  } catch (err: any) {
    console.error(err);
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

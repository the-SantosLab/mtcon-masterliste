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
      const { error: delErr } = await admin.auth.admin.deleteUser(conflict.id);
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

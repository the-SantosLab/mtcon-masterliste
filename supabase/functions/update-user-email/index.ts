import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { oldEmail, newEmail } = body;

    if (!oldEmail || !newEmail) {
      return json({ error: 'Missing oldEmail or newEmail' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // List users to find the one with the old email
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      return json({ error: listError.message }, 500);
    }

    const user = listData.users.find((u: any) => u.email?.toLowerCase() === oldEmail.toLowerCase());
    if (!user) {
      return json({ error: 'User not found with that email' }, 404);
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, { email: newEmail });
    if (updateError) {
      console.error('Update user error:', updateError);
      return json({ error: 'Update user error: ' + updateError.message, code: updateError.status }, 500);
    }

    return json({ success: true, userId: user.id, newEmail });
  } catch (err: any) {
    console.error('Error:', err);
    return json({ error: err.message || 'Internal error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

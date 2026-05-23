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

  let user_id: string | undefined;
  try {
    const body = await req.json();
    user_id = body.user_id;
  } catch {
    // ignore
  }
  if (!user_id) {
    return new Response(JSON.stringify({ error: 'user_id ist erforderlich' }), { status: 400, headers: corsHeaders });
  }
  if (user_id === user.id) {
    return new Response(JSON.stringify({ error: 'Sie können sich nicht selbst ausloggen' }), { status: 400, headers: corsHeaders });
  }

  // Revoke all refresh tokens / sessions for the target user
  const { error: signOutErr } = await supabaseAdmin.auth.admin.signOut(user_id, 'global');
  if (signOutErr) {
    return new Response(JSON.stringify({ error: 'Sitzungen konnten nicht beendet werden: ' + signOutErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Remove presence so panel updates immediately
  await supabaseAdmin.from('user_presence').delete().eq('user_id', user_id);

  // Broadcast realtime signal so any open client tab signs out immediately
  try {
    const channel = supabaseAdmin.channel('force-logout');
    await channel.subscribe();
    await channel.send({
      type: 'broadcast',
      event: 'logout',
      payload: { user_id, by: user.id, at: new Date().toISOString() },
    });
    await supabaseAdmin.removeChannel(channel);
  } catch (e) {
    console.error('Broadcast failed', e);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

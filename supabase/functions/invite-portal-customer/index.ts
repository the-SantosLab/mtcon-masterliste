import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is staff/admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !caller) throw new Error("Not authenticated");

    // Check caller has staff or admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || !["admin", "staff"].includes(roleData.role)) {
      throw new Error("Insufficient permissions");
    }

    const { email, displayName, companyName, password, invitedBy } = await req.json();

    if (!email || !displayName || !password) {
      throw new Error("Missing required fields: email, displayName, password");
    }

    // Create auth user (auto-confirm so they can log in immediately)
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, is_portal_customer: true },
    });

    if (createErr) throw createErr;

    // Create portal_customers record
    const { error: customerErr } = await supabase.from("portal_customers").insert({
      auth_user_id: newUser.user.id,
      email,
      display_name: displayName,
      company_name: companyName || null,
      invited_by: invitedBy,
    });

    if (customerErr) throw customerErr;

    // Give them a 'viewer' role so they pass basic auth but can't access internal features
    // Actually, portal customers shouldn't have a user_roles entry - they use portal_customers table
    // The handle_new_user trigger may have created a users_profile entry, clean it up
    await supabase.from("users_profile").delete().eq("id", newUser.user.id);
    await supabase.from("user_roles").delete().eq("user_id", newUser.user.id);

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

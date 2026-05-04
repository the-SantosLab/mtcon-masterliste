import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const DEFAULT_FOLDERS = [
  { name: '01_Admin',      sort: 1 },
  { name: '02_Briefing',   sort: 2 },
  { name: '03_Kalkulation', sort: 3 },
  { name: '04_Assets',     sort: 4 },
  { name: '05_Delivery',   sort: 5 },
  { name: '99_Archiv',     sort: 99 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require valid session and admin or staff role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await supabaseAuth.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;
    const { data: roles } = await supabaseAuth
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'staff']);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { project_id, project_number, project_code } = await req.json();

    if (!project_id) {
      return new Response(JSON.stringify({ error: 'project_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const folderPrefix = `${project_code || 'PRJ'}_${project_number || project_id}`;

    // Create DB folder entries
    const folderInserts = DEFAULT_FOLDERS.map(f => ({
      project_id,
      name: f.name,
      path: `${folderPrefix}/${f.name}/`,
      parent_id: null,
      sort_order: f.sort,
    }));

    const { error: dbError } = await supabase
      .from('project_folders')
      .insert(folderInserts);

    if (dbError) throw dbError;

    // Create placeholder files in Storage so folders appear
    for (const f of DEFAULT_FOLDERS) {
      const path = `${folderPrefix}/${f.name}/.keep`;
      await supabase.storage
        .from('project-files')
        .upload(path, new Blob([''], { type: 'text/plain' }), { upsert: true });
    }

    return new Response(JSON.stringify({ success: true, folders: folderInserts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

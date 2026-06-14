import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { case_id } = await req.json();
    if (!case_id || typeof case_id !== 'string') {
      return new Response(JSON.stringify({ error: 'case_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: c, error: cErr } = await supabase.from('cases').select('id, department_id').eq('id', case_id).single();
    if (cErr || !c?.department_id) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no department' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tpl } = await supabase.from('dept_folder_templates').select('folders, bucket').eq('department_id', c.department_id).maybeSingle();
    if (!tpl || !tpl.folders?.length) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no template' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const created: string[] = [];
    for (const folder of tpl.folders) {
      const path = `${case_id}/${folder}/.keep`;
      const { error } = await supabase.storage.from(tpl.bucket).upload(path, new Blob([''], { type: 'text/plain' }), { upsert: true, contentType: 'text/plain' });
      if (!error) created.push(folder);
    }

    return new Response(JSON.stringify({ ok: true, bucket: tpl.bucket, created }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const { path } = await req.json();
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.storage.from("support-attachments").download(path);
  if (error || !data) return new Response(JSON.stringify({ error: error?.message }), { status: 500 });
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return new Response(JSON.stringify({ b64: btoa(bin), size: buf.length }), {
    headers: { "Content-Type": "application/json" },
  });
});

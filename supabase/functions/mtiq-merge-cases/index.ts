// MTIQ Merge: übernimmt Notizen, Unteraufgaben, Chatnachrichten von source→target
// und setzt source auf Status "verworfen" mit Verweis auf target.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { source_id, target_id, apply_customer_from_source } = await req.json();
    if (!source_id || !target_id || source_id === target_id) {
      return new Response(JSON.stringify({ error: "source_id und target_id erforderlich (unterschiedlich)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: pair, error: perr } = await client
      .from("cases")
      .select("id, case_no, project_name, status, customer_no, client_name")
      .in("id", [source_id, target_id]);
    if (perr || !pair || pair.length !== 2) {
      return new Response(JSON.stringify({ error: "Vorgänge nicht gefunden oder keine Berechtigung" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const src = pair.find(p => p.id === source_id)!;
    const tgt = pair.find(p => p.id === target_id)!;

    const moved: Record<string, number> = { notes: 0, tasks: 0, chat: 0 };

    // Notizen umhängen
    {
      const { count } = await client.from("case_notes").update({ case_id: target_id }).eq("case_id", source_id).select("id", { count: "exact", head: true });
      moved.notes = count ?? 0;
    }
    // Unteraufgaben umhängen
    {
      const { count } = await client.from("case_tasks").update({ case_id: target_id }).eq("case_id", source_id).select("id", { count: "exact", head: true });
      moved.tasks = count ?? 0;
    }
    // Chatnachrichten umhängen
    {
      const { count } = await client.from("case_chat_messages").update({ case_id: target_id }).eq("case_id", source_id).select("id", { count: "exact", head: true });
      moved.chat = count ?? 0;
    }

    // System-Notiz im Ziel
    await client.from("case_notes").insert({
      case_id: target_id,
      author_id: user.id,
      body: `Zusammenführung durch MTIQ-Duplikat-Scan: Vorgang ${src.case_no ?? src.id} („${src.project_name ?? ""}") wurde in diesen Vorgang integriert. Notizen: ${moved.notes}, Unteraufgaben: ${moved.tasks}, Chatnachrichten: ${moved.chat}.`,
      pinned: false,
    });

    // Quelle als verworfen markieren, Verweis in Notizfeld
    const mergeNote = `\n\n[MTIQ Merge ${new Date().toISOString().slice(0, 10)}] Zusammengeführt mit ${tgt.case_no ?? tgt.id} („${tgt.project_name ?? ""}").`;
    const { data: srcRow } = await client.from("cases").select("note").eq("id", source_id).maybeSingle();
    await client.from("cases").update({
      status: "verworfen",
      note: `${(srcRow as any)?.note ?? ""}${mergeNote}`,
    }).eq("id", source_id);

    return new Response(JSON.stringify({ ok: true, moved, source: src, target: tgt }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("mtiq-merge-cases error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

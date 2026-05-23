// MTIQ AI – one-shot tool runner. Loads case context, runs a single prompt,
// returns plain text. Does NOT persist into ai_messages (so tools don't pollute the chat).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const vorgang_id: string = body.vorgang_id;
    const tool: string = body.tool ?? "";
    const user_input: string = (body.input ?? "").toString();
    const system_addon: string = (body.system ?? "").toString();
    const instruction: string = (body.instruction ?? "").toString();
    if (!vorgang_id || !instruction) {
      return new Response(JSON.stringify({ error: "vorgang_id and instruction required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: caseRow } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, due_at, received_at, estimated_hours, urgency, customer_no, departments:department_id(name)")
      .eq("id", vorgang_id)
      .maybeSingle();
    if (!caseRow) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: subtasks }, { data: notes }] = await Promise.all([
      client.from("case_tasks").select("title, status, urgency, due_at").eq("case_id", vorgang_id).order("sort_order").limit(50),
      client.from("case_notes").select("body, pinned, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(10),
    ]);

    const dept = (caseRow as any).departments?.name ?? "-";
    const subtaskLines = (subtasks ?? []).map((t: any, i: number) =>
      `  ${i + 1}. [${t.status ?? "?"}] ${t.urgency ? `${t.urgency}🌶 ` : ""}${t.title}${t.due_at ? ` (fällig ${t.due_at})` : ""}`
    ).join("\n") || "  keine";
    const noteLines = (notes ?? []).map((n: any) =>
      `  • ${n.created_at?.slice(0,10)}${n.pinned ? " 📌" : ""} ${String(n.body ?? "").slice(0,300).replace(/\n/g," ")}`
    ).join("\n") || "  keine";

    const systemPrompt = `Du bist MTIQ, Tool-Modus "${tool}". Stil: neutral, präzise, Deutsch, kurz, keine Floskeln. Liefere direkt das Ergebnis ohne Vorwort.
${system_addon}

Vorgang:
- Nummer: ${caseRow.case_no}
- Titel: ${caseRow.project_name}
- Kunde: ${caseRow.client_name ?? "-"}
- Abteilung: ${dept}
- Status: ${caseRow.status}
- Chilis: ${caseRow.urgency ?? 0}/5
- Fällig: ${caseRow.due_at ?? "-"} | Eingang: ${caseRow.received_at ?? "-"}
- Notiz: ${(caseRow.note ?? "").slice(0, 600)}

Unteraufgaben:
${subtaskLines}

Notizen:
${noteLines}`;

    const userContent = user_input.trim() ? `${instruction}\n\nEingabe:\n${user_input}` : instruction;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht." }), {
        status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const j = await aiResp.json();
    const reply: string = j?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ reply }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-tool error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

// MTIQ – Vorgangs-Zusammenfassung: lädt Chat, Notizen, Aktivitäten, Subtasks
// und erzeugt eine kompakte 3–5-Satz-Zusammenfassung.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const DEFAULT_SUMMARIZE_PROMPT = `Du bist MTIQ. Erstelle eine kompakte Zusammenfassung in 3–5 Sätzen auf Deutsch.
Stil: neutral, präzise, keine Floskeln, keine Aufzählungen, kein Markdown.
Decke ab: aktueller Stand, wichtigste offene Punkte, nächste sinnvolle Schritte, Dringlichkeit/Fälligkeit falls relevant.`;

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
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { vorgang_id } = await req.json();
    if (!vorgang_id) {
      return new Response(JSON.stringify({ error: "vorgang_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: c } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, due_at, received_at, urgency, departments:department_id(name)")
      .eq("id", vorgang_id)
      .maybeSingle();
    if (!c) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: subtasks }, { data: notes }, { data: chat }, { data: activity }] = await Promise.all([
      client.from("case_tasks").select("title, status, completed, urgency, due_at").eq("case_id", vorgang_id).order("sort_order").limit(50),
      client.from("case_notes").select("body, pinned, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(15),
      client.from("case_chat_messages").select("body, created_at, system_kind").eq("case_id", vorgang_id).is("deleted_at", null).order("created_at", { ascending: true }).limit(40),
      client.from("case_activity").select("action, field, old_value, new_value, message, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(25),
    ]);

    const dept = (c as any).departments?.name ?? "-";
    const subtaskLines = (subtasks ?? []).map((t: any, i: number) =>
      `  ${i + 1}. [${t.completed ? "✓" : t.status ?? "?"}] ${t.title}${t.due_at ? ` (fällig ${t.due_at})` : ""}`
    ).join("\n") || "  keine";
    const noteLines = (notes ?? []).map((n: any) =>
      `  • ${n.created_at?.slice(0,10)}${n.pinned ? " 📌" : ""} ${String(n.body ?? "").slice(0,200).replace(/\n/g," ")}`
    ).join("\n") || "  keine";
    const chatLines = (chat ?? []).map((m: any) =>
      `  ${m.created_at?.slice(0,16).replace("T"," ")}${m.system_kind ? " [sys]" : ""}: ${String(m.body ?? "").slice(0,180).replace(/\n/g," ")}`
    ).join("\n") || "  keine";
    const activityLines = (activity ?? []).map((a: any) =>
      `  • ${a.created_at?.slice(0,10)} ${a.action}${a.field ? ` ${a.field}` : ""}: ${a.message ?? `${a.old_value ?? ""} → ${a.new_value ?? ""}`}`
    ).join("\n") || "  keine";

    const systemPrompt = `Du bist MTIQ. Erstelle eine kompakte Zusammenfassung in 3–5 Sätzen auf Deutsch.
Stil: neutral, präzise, keine Floskeln, keine Aufzählungen, kein Markdown.
Decke ab: aktueller Stand, wichtigste offene Punkte, nächste sinnvolle Schritte, Dringlichkeit/Fälligkeit falls relevant.

Vorgang:
- Nr: ${c.case_no} · Titel: ${c.project_name} · Kunde: ${c.client_name ?? "-"} · Abt: ${dept}
- Status: ${c.status} · Chilis: ${c.urgency ?? 0}/5 · Fällig: ${c.due_at ?? "-"} · Eingang: ${c.received_at ?? "-"}
- Notiz: ${(c.note ?? "").slice(0, 500)}

Unteraufgaben:
${subtaskLines}

Notizen:
${noteLines}

Aktivitäten (neueste zuerst):
${activityLines}

Chat-Verlauf (chronologisch):
${chatLines}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Fasse den Vorgang jetzt zusammen." },
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
    const summary: string = j?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ summary }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-summarize-case error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

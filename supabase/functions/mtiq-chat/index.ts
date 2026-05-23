// MTIQ AI chat – calls Lovable AI Gateway and persists messages in ai_messages
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant" | "system"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const vorgang_id: string | null = body.vorgang_id ?? null;
    const userMessage: string = (body.message ?? "").toString();
    if (!vorgang_id || !userMessage.trim()) {
      return new Response(JSON.stringify({ error: "vorgang_id and message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load case context (respecting RLS via user client)
    const { data: caseRow } = await client
      .from("cases")
      .select("case_no, project_name, client_name, status, note, due_at, estimated_hours, urgency, urgency_label, departments:department_id(name)")
      .eq("id", vorgang_id)
      .maybeSingle();

    if (!caseRow) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden oder kein Zugriff" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Subtasks (with their own urgency / status)
    const { data: subtasks } = await client
      .from("case_tasks")
      .select("title, status, urgency, assigned_to, due_at")
      .eq("case_id", vorgang_id)
      .order("created_at", { ascending: true })
      .limit(50);

    // Load recent history (last 20)
    const { data: history } = await client
      .from("ai_messages")
      .select("role, content")
      .eq("vorgang_id", vorgang_id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(40);

    // Persist user message
    await client.from("ai_messages").insert({
      vorgang_id, user_id: user.id, role: "user", content: userMessage, read_at: new Date().toISOString(),
    });

    const chiliMap: Record<number, string> = { 1: "1 Chili (niedrig)", 2: "2 Chilis", 3: "3 Chilis (mittel)", 4: "4 Chilis", 5: "5 Chilis (kritisch)" };
    const caseChili = (caseRow as any).urgency ? chiliMap[(caseRow as any).urgency] ?? `${(caseRow as any).urgency} Chilis` : "nicht gesetzt";
    const deptName = (caseRow as any).departments?.name ?? "-";

    const subtaskLines = (subtasks ?? []).map((t: any, i: number) => {
      const u = t.urgency ? `${t.urgency}🌶` : "—";
      return `  ${i + 1}. [${t.status ?? "?"}] ${u} ${t.title ?? ""}${t.due_at ? ` (fällig ${t.due_at})` : ""}`;
    }).join("\n");

    const systemPrompt = `Du bist MTIQ, der KI-Assistent für die Masterliste (MTCON).
Stil: präzise, neutral, Deutsch, keine Floskeln, keine Emojis, keine Konjunktiv-Schleifen ("falls", "eventuell"). Wenn Daten fehlen: ein Satz dazu, dann fertig.

Dringlichkeit in Masterliste wird in "Chilis" (1–5) ausgedrückt: 1 = niedrigste, 5 = höchste Priorität. Sowohl der Vorgang als auch jede Unteraufgabe können einen Chili-Wert haben.

Aktueller Vorgang:
- Nummer: ${caseRow.case_no ?? "-"}
- Titel: ${caseRow.project_name ?? "-"}
- Kunde: ${caseRow.client_name ?? "-"}
- Abteilung: ${deptName}
- Status: ${caseRow.status ?? "-"}
- Chilis: ${caseChili}
- Fällig: ${caseRow.due_at ?? "-"}
- Geschätzt: ${caseRow.estimated_hours ?? "-"} h
- Notiz: ${(caseRow.note ?? "").slice(0, 800)}

Unteraufgaben (${subtasks?.length ?? 0}):
${subtaskLines || "  keine"}

Wenn der Nutzer nach "den Vorgängen mit den meisten Chilis" o.ä. fragt, beziehst du dich nur auf diesen Vorgang und seine Unteraufgaben — du hast keinen Zugriff auf andere Vorgänge. Sag das in einem Satz und beantworte dann die Frage soweit möglich für diesen Vorgang.`;

    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...((history ?? []) as Msg[]),
      { role: "user", content: userMessage },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Zu viele Anfragen. Bitte später erneut versuchen." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const reply: string = aiJson?.choices?.[0]?.message?.content ?? "";

    const { data: inserted } = await client
      .from("ai_messages")
      .insert({ vorgang_id, user_id: user.id, role: "assistant", content: reply })
      .select()
      .single();

    return new Response(JSON.stringify({ reply, message: inserted }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-chat error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

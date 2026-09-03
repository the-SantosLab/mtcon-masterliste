// MTIQ – Besprechungsprotokoll: wertet ein Meeting-Transkript im Kontext eines
// Vorgangs strukturiert aus (Themen, Beschlüsse, Aufgaben, Zusammenfassung, Fazit).
// Liefert JSON; das PDF wird clientseitig erzeugt und im Vorgang abgelegt.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const DEFAULT_PROMPT = `Du bist MTIQ. Erstelle aus einem Besprechungstranskript ein sachliches Besprechungsprotokoll auf Deutsch.
Regeln:
- Neutral, präzise, keine Floskeln, keine Emojis.
- Fasse pro Thema die wesentlichen Inhalte in 2–5 Sätzen zusammen und nenne getroffene Beschlüsse.
- Leite konkrete Aufgaben ab (kurzer Imperativ-Satz, max 90 Zeichen). Verantwortlich und Fälligkeit nur, wenn im Transkript genannt (Datum als YYYY-MM-DD, sonst leer).
- "summary": Zusammenfassung der Besprechung in 3–6 Sätzen.
- "conclusion": Fazit / Ergebnis und nächste Schritte in 2–4 Sätzen.
- "title": kurzer Protokolltitel (max 80 Zeichen). "participants": nur genannte Personen.
- Antworte AUSSCHLIESSLICH als JSON-Objekt:
{"title":"...","participants":["..."],"agenda_items":[{"topic":"...","discussion":"...","decisions":["..."]}],"tasks":[{"title":"...","assignee":"","due":""}],"summary":"...","conclusion":"..."}`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    if (!userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const vorgang_id = typeof body.vorgang_id === "string" ? body.vorgang_id : "";
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    const meeting_date = typeof body.meeting_date === "string" ? body.meeting_date.slice(0, 10) : "";
    const participants = typeof body.participants === "string" ? body.participants.trim().slice(0, 500) : "";
    if (!vorgang_id || !transcript) return json({ error: "vorgang_id und transcript erforderlich" }, 400);
    if (transcript.length > 60000) return json({ error: "Transkript zu lang (max. 60.000 Zeichen)" }, 400);

    const { data: c } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, departments:department_id(name)")
      .eq("id", vorgang_id)
      .maybeSingle();
    if (!c) return json({ error: "Vorgang nicht gefunden" }, 403);

    const { data: subtasks } = await client
      .from("case_tasks").select("title, completed").eq("case_id", vorgang_id).order("sort_order").limit(50);
    const existing = (subtasks ?? []).map((t: any) => `- ${t.completed ? "[✓] " : ""}${t.title}`).join("\n") || "  (keine)";

    const basePrompt = await loadPrompt("mtiq_meeting_minutes", DEFAULT_PROMPT);
    const systemPrompt = `${basePrompt}

Vorgang:
- Nr: ${c.case_no} · Titel: ${c.project_name} · Kunde: ${c.client_name ?? "-"} · Abt: ${(c as any).departments?.name ?? "-"}
- Status: ${c.status}
- Notiz: ${(c.note ?? "").slice(0, 500)}
${meeting_date ? `- Besprechungsdatum: ${meeting_date}` : ""}
${participants ? `- Teilnehmer (Angabe des Anwenders): ${participants}` : ""}

Bereits vorhandene Unteraufgaben (keine Doppelungen):
${existing}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Transkript:\n${transcript}` },
        ],
      }),
    });
    if (aiResp.status === 429 || aiResp.status === 402) {
      return json({ error: aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht." }, aiResp.status);
    }
    if (!aiResp.ok) {
      console.error("AI gateway error", aiResp.status, await aiResp.text());
      return json({ error: "AI gateway error" }, 500);
    }
    const j = await aiResp.json();
    const raw: string = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {
      const m = raw.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }
    const str = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const minutes = {
      title: str(parsed.title, 120) || `Besprechung ${c.case_no}`,
      date: meeting_date || new Date().toISOString().slice(0, 10),
      participants: participants
        ? participants.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
        : arr(parsed.participants).map((p) => str(p, 80)).filter(Boolean),
      agenda_items: arr(parsed.agenda_items).slice(0, 30).map((a: any) => ({
        topic: str(a?.topic, 160),
        discussion: str(a?.discussion),
        decisions: arr(a?.decisions).map((d) => str(d, 400)).filter(Boolean),
      })).filter((a) => a.topic || a.discussion),
      tasks: arr(parsed.tasks).slice(0, 40).map((t: any) => ({
        title: str(t?.title, 120), assignee: str(t?.assignee, 80), due: str(t?.due, 10),
      })).filter((t) => t.title),
      summary: str(parsed.summary),
      conclusion: str(parsed.conclusion),
      case_no: c.case_no,
      case_title: c.project_name,
      client_name: c.client_name ?? null,
    };
    return json({ minutes });
  } catch (e) {
    console.error("mtiq-meeting-minutes error", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});

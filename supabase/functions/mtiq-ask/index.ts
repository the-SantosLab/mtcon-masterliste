// MTIQ freier Chat (session-basiert, ohne Vorgangsbindung).
// Read-only tools: query_cases, report_cases, query_projects. Antwortet auf Deutsch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PROMPT = `Du bist MTIQ, KI-Assistent für die Masterliste (MTCON).
Stil: präzise, neutral, Deutsch, kurz, keine Floskeln, keine Emojis außer 🌶 für Chilis. Kein Konjunktiv. Direkt antworten. Bei Unklarheit genau eine Rückfrage.
Werkzeuge (nur lesend): query_cases, report_cases, query_projects. Frei über Vorgänge, Projekte, Kennzahlen antworten. Nutze search_text aktiv, auch archivierte Fälle sind durchsuchbar.`;

const tools = [
  {
    type: "function",
    function: {
      name: "query_cases",
      description: "Liest Vorgänge (inkl. Archiv). Nur lesend.",
      parameters: {
        type: "object",
        properties: {
          sort_by: { type: "string", enum: ["urgency", "due_at", "created_at"] },
          direction: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", minimum: 1, maximum: 25 },
          status: { type: "string" },
          only_open: { type: "boolean" },
          include_archived: { type: "boolean" },
          search_text: { type: "string" },
          min_urgency: { type: "integer", minimum: 1, maximum: 5 },
          assignee_me: { type: "boolean" },
          overdue: { type: "boolean" },
          department_name: { type: "string" },
          project_id: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_cases",
      description: "Aggregierter Bericht (group_by: department|status|urgency|assignee|project).",
      parameters: {
        type: "object",
        required: ["group_by"],
        properties: {
          group_by: { type: "string", enum: ["department", "status", "urgency", "assignee", "project"] },
          only_open: { type: "boolean" },
          overdue: { type: "boolean" },
          min_urgency: { type: "integer", minimum: 1, maximum: 5 },
          since_days: { type: "integer", minimum: 1, maximum: 365 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_projects",
      description: "Listet Projekte inkl. Zählungen offener/gesamter Vorgänge.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "archived"] },
          include_archived: { type: "boolean" },
          name_like: { type: "string" },
          search_text: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
    },
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const client = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const history: { role: string; content: string }[] = Array.isArray(body.history) ? body.history.slice(-20) : [];
    const userMessage: string = String(body.message ?? "").trim();
    if (!userMessage) return new Response(JSON.stringify({ error: "message required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: meProfile } = await client.from("users_profile").select("display_name, short_code").eq("id", user.id).maybeSingle();
    const basePrompt = await loadPrompt("mtiq_ask", DEFAULT_PROMPT).catch(() => DEFAULT_PROMPT);
    const systemPrompt = `${basePrompt}\n\nAktueller Nutzer: ${meProfile?.display_name ?? user.email} (${meProfile?.short_code ?? "-"}, id ${user.id}).`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.filter(h => h.role === "user" || h.role === "assistant").map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userMessage },
    ];

    let finalReply = "";
    let safety = 0;
    while (safety++ < 4) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools, tool_choice: "auto" }),
      });
      if (aiResp.status === 429 || aiResp.status === 402) {
        return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Zu viele Anfragen. Bitte später erneut versuchen." : "AI-Guthaben aufgebraucht." }), { status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("AI gateway error", aiResp.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const aiJson = await aiResp.json();
      const choice = aiJson?.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) { finalReply = (choice?.content ?? "").toString(); break; }
      messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: toolCalls });
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }
        let result: any = null;
        if (name === "query_cases") {
          let q = client.from("cases").select("case_no, project_name, client_name, status, urgency, due_at, completed_at, departments:department_id(name)").eq("deleted", false);
          if (args.only_open || args.include_archived === false) q = q.not("status", "in", "(abgeschlossen,archiv,verworfen)");
          if (args.status) q = q.eq("status", args.status);
          if (args.min_urgency) q = q.gte("urgency", args.min_urgency);
          if (args.assignee_me) q = q.eq("assignee_id", user.id);
          if (args.project_id) q = q.eq("project_id", args.project_id);
          if (args.overdue) q = q.lt("due_at", new Date().toISOString().slice(0, 10)).neq("status", "abgeschlossen");
          if (args.search_text) {
            const needle = String(args.search_text).replace(/[%,()]/g, " ").trim();
            if (needle) {
              const pat = `%${needle}%`;
              q = q.or(`project_name.ilike.${pat},client_name.ilike.${pat},case_no.ilike.${pat},customer_no.ilike.${pat},note.ilike.${pat}`);
            }
          }
          const sort = args.sort_by ?? "urgency";
          const dir = (args.direction ?? "desc") === "asc";
          q = q.order(sort, { ascending: dir, nullsFirst: false }).limit(Math.min(args.limit ?? 10, 25));
          const { data: rows, error } = await q;
          let filtered = rows ?? [];
          if (args.department_name) {
            const n = String(args.department_name).toLowerCase();
            filtered = filtered.filter((r: any) => (r.departments?.name ?? "").toLowerCase().includes(n));
          }
          result = error ? { error: error.message } : filtered.map((r: any) => ({ case_no: r.case_no, title: r.project_name, kunde: r.client_name, status: r.status, chilis: r.urgency, fällig: r.due_at, abteilung: r.departments?.name ?? null }));
        } else if (name === "report_cases") {
          let q = client.from("cases").select("status, urgency, assignee_id, project_id, due_at, created_at, departments:department_id(name)").eq("deleted", false);
          if (args.only_open) q = q.neq("status", "abgeschlossen");
          if (args.min_urgency) q = q.gte("urgency", args.min_urgency);
          if (args.overdue) q = q.lt("due_at", new Date().toISOString().slice(0, 10)).neq("status", "abgeschlossen");
          if (args.since_days) q = q.gte("created_at", new Date(Date.now() - args.since_days * 86400000).toISOString());
          q = q.limit(1000);
          const { data: rows, error } = await q;
          if (error) result = { error: error.message };
          else {
            const buckets: Record<string, number> = {};
            for (const r of rows ?? []) {
              let key = "—";
              switch (args.group_by) {
                case "department": key = (r as any).departments?.name ?? "ohne Abteilung"; break;
                case "status": key = r.status ?? "—"; break;
                case "urgency": key = r.urgency != null ? `${r.urgency}🌶` : "ohne"; break;
                case "assignee": key = r.assignee_id ?? "ohne Zuständigen"; break;
                case "project": key = r.project_id ?? "ohne Projekt"; break;
              }
              buckets[key] = (buckets[key] ?? 0) + 1;
            }
            result = { total: rows?.length ?? 0, group_by: args.group_by, counts: buckets };
          }
        } else if (name === "query_projects") {
          let q = client.from("projects").select("id, name, project_number, project_code, status, urgency");
          if (args.status) q = q.eq("status", args.status);
          if (args.include_archived === false) q = q.not("status", "in", "(archived,completed)");
          if (args.name_like) q = q.ilike("name", `%${args.name_like}%`);
          if (args.search_text) {
            const needle = String(args.search_text).replace(/[%,()]/g, " ").trim();
            if (needle) {
              const pat = `%${needle}%`;
              q = q.or(`name.ilike.${pat},project_number.ilike.${pat},project_code.ilike.${pat}`);
            }
          }
          q = q.order("urgency", { ascending: false, nullsFirst: false }).limit(Math.min(args.limit ?? 10, 25));
          const { data: rows, error } = await q;
          result = error ? { error: error.message } : rows;
        } else {
          result = { error: `unknown tool ${name}` };
        }
        messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
      }
    }

    return new Response(JSON.stringify({ reply: finalReply || "(leer)" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("mtiq-ask error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

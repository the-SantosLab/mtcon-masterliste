// MTIQ AI chat – with extended context (case chat, notes, activity),
// cross-case read tool, and write tools that are returned as proposed_actions
// for explicit user confirmation (no auto-mutations).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string; tool_calls?: any[]; name?: string };

const chiliMap: Record<number, string> = { 1: "1🌶 niedrig", 2: "2🌶", 3: "3🌶 mittel", 4: "4🌶", 5: "5🌶 kritisch" };

// ---------- Tool schemas ----------
const tools = [
  {
    type: "function",
    function: {
      name: "query_cases",
      description: "Liest mehrere Vorgänge aus der Masterliste, gefiltert/sortiert. Nur lesend. Nutzbar für Fragen wie 'welche Vorgänge haben die meisten Chilis', 'überfällige Vorgänge', 'Vorgänge in Abteilung X'.",
      parameters: {
        type: "object",
        properties: {
          sort_by: { type: "string", enum: ["urgency", "due_at", "created_at"], description: "Sortierfeld" },
          direction: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", minimum: 1, maximum: 25 },
          status: { type: "string", description: "Status-Filter, z.B. nicht_begonnen, in_arbeit, abgeschlossen" },
          only_open: { type: "boolean", description: "Nur nicht-abgeschlossene Vorgänge" },
          min_urgency: { type: "integer", minimum: 1, maximum: 5 },
          assignee_me: { type: "boolean", description: "Nur dem aktuellen Nutzer zugewiesene Vorgänge" },
          overdue: { type: "boolean", description: "Nur überfällige Vorgänge (due_at < heute, nicht abgeschlossen)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_case_status",
      description: "Schlägt vor, den Status des aktuellen Vorgangs zu ändern. Wird dem Nutzer zur Bestätigung angezeigt.",
      parameters: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", description: "Neuer Status (z.B. nicht_begonnen, in_arbeit, ready_for_review, abgeschlossen, blocked)" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_case_urgency",
      description: "Schlägt vor, die Chili-Anzahl (Dringlichkeit, 0-5) des aktuellen Vorgangs zu ändern.",
      parameters: {
        type: "object", required: ["urgency"],
        properties: { urgency: { type: "integer", minimum: 0, maximum: 5 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_subtask",
      description: "Schlägt vor, eine Unteraufgabe im aktuellen Vorgang anzulegen.",
      parameters: {
        type: "object", required: ["title"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          due_at: { type: "string", description: "Fälligkeitsdatum YYYY-MM-DD" },
          urgency: { type: "integer", minimum: 0, maximum: 5 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_subtask",
      description: "Schlägt vor, eine bestehende Unteraufgabe (Status, Titel oder Dringlichkeit) zu ändern.",
      parameters: {
        type: "object", required: ["subtask_id"],
        properties: {
          subtask_id: { type: "string" },
          status: { type: "string", description: "z.B. open, in_progress, done, blocked" },
          title: { type: "string" },
          urgency: { type: "integer", minimum: 0, maximum: 5 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_case_note",
      description: "Schlägt vor, eine Notiz zum aktuellen Vorgang hinzuzufügen.",
      parameters: { type: "object", required: ["body"], properties: { body: { type: "string" }, pinned: { type: "boolean" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "post_case_chat",
      description: "Schlägt vor, eine Nachricht im Vorgang-Chat (Team) zu posten.",
      parameters: { type: "object", required: ["body"], properties: { body: { type: "string" } } },
    },
  },
];

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

    // ---- Load current case context ----
    const { data: caseRow } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, due_at, received_at, estimated_hours, urgency, assignee_id, customer_no, departments:department_id(id,name)")
      .eq("id", vorgang_id)
      .maybeSingle();

    if (!caseRow) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden oder kein Zugriff" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: subtasks }, { data: notes }, { data: activity }, { data: chat }, { data: history }, { data: meProfile }] = await Promise.all([
      client.from("case_tasks")
        .select("id, title, status, urgency, assigned_to, due_at")
        .eq("case_id", vorgang_id)
        .order("sort_order", { ascending: true })
        .limit(50),
      client.from("case_notes")
        .select("body, pinned, author_id, created_at")
        .eq("case_id", vorgang_id)
        .order("created_at", { ascending: false })
        .limit(10),
      client.from("case_activity")
        .select("action, field, old_value, new_value, message, created_at, actor_id")
        .eq("case_id", vorgang_id)
        .order("created_at", { ascending: false })
        .limit(20),
      client.from("case_chat_messages")
        .select("body, author_id, created_at, system_kind")
        .eq("case_id", vorgang_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      client.from("ai_messages")
        .select("role, content")
        .eq("vorgang_id", vorgang_id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(30),
      client.from("users_profile").select("display_name, short_code").eq("id", user.id).maybeSingle(),
    ]);

    // Persist user message
    await client.from("ai_messages").insert({
      vorgang_id, user_id: user.id, role: "user", content: userMessage, read_at: new Date().toISOString(),
    });

    const caseChili = caseRow.urgency ? (chiliMap[caseRow.urgency] ?? `${caseRow.urgency}🌶`) : "nicht gesetzt";
    const deptName = (caseRow as any).departments?.name ?? "-";

    const subtaskLines = (subtasks ?? []).map((t: any, i: number) =>
      `  ${i + 1}. [id:${t.id}] [${t.status ?? "?"}] ${t.urgency ? `${t.urgency}🌶 ` : ""}${t.title ?? ""}${t.due_at ? ` (fällig ${t.due_at})` : ""}`
    ).join("\n") || "  keine";

    const noteLines = (notes ?? []).map((n: any) =>
      `  • ${n.created_at?.slice(0,10) ?? ""}${n.pinned ? " 📌" : ""} ${String(n.body ?? "").slice(0,200).replace(/\n/g," ")}`
    ).join("\n") || "  keine";

    const chatLines = (chat ?? []).slice().reverse().map((c: any) =>
      `  • ${c.created_at?.slice(0,16).replace("T"," ")}${c.system_kind ? ` [${c.system_kind}]` : ""}: ${String(c.body ?? "").slice(0,160).replace(/\n/g," ")}`
    ).join("\n") || "  keine";

    const activityLines = (activity ?? []).slice().reverse().map((a: any) =>
      `  • ${a.created_at?.slice(0,16).replace("T"," ")} ${a.action}${a.field ? ` ${a.field}` : ""}${a.old_value || a.new_value ? `: ${a.old_value ?? "—"} → ${a.new_value ?? "—"}` : ""}${a.message ? ` (${a.message})` : ""}`
    ).join("\n") || "  keine";

    const systemPrompt = `Du bist MTIQ, der KI-Assistent für die Masterliste (MTCON).
Stil: präzise, neutral, Deutsch, kurz, keine Floskeln, keine Emojis außer 🌶 für Chilis, kein Konjunktiv ("falls", "eventuell"). Antworte direkt. Wenn etwas unklar ist, frage genau eine konkrete Rückfrage.

Du hast Werkzeuge:
- query_cases: andere Vorgänge der Masterliste lesen (z.B. Top-Chilis, überfällig).
- set_case_status / set_case_urgency / create_subtask / update_subtask / add_case_note / post_case_chat: Änderungen am aktuellen Vorgang VORSCHLAGEN. Diese werden NICHT direkt ausgeführt — der Nutzer muss bestätigen. Rufe das passende Tool, wenn der Nutzer eine Änderung verlangt, und beschreibe danach in 1–2 Sätzen, was zur Bestätigung vorgeschlagen wurde.

Aktueller Nutzer: ${meProfile?.display_name ?? user.email} (${meProfile?.short_code ?? "-"}, id ${user.id})

Aktueller Vorgang:
- ID: ${caseRow.id}
- Nummer: ${caseRow.case_no}
- Titel: ${caseRow.project_name}
- Kunde: ${caseRow.client_name ?? "-"} (${caseRow.customer_no ?? "-"})
- Abteilung: ${deptName}
- Status: ${caseRow.status}
- Chilis: ${caseChili}
- Eingang: ${caseRow.received_at ?? "-"} | Fällig: ${caseRow.due_at ?? "-"} | Geschätzt: ${caseRow.estimated_hours ?? "-"} h
- Notizfeld: ${(caseRow.note ?? "").slice(0, 600)}

Unteraufgaben (${subtasks?.length ?? 0}):
${subtaskLines}

Letzte Notizen:
${noteLines}

Letzte Vorgang-Chat Nachrichten:
${chatLines}

Letzte Aktivitäten:
${activityLines}`;

    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...((history ?? []) as Msg[]).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userMessage },
    ];

    const proposed_actions: any[] = [];
    let finalReply = "";
    let safety = 0;

    while (safety++ < 4) {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, tools, tool_choice: "auto" }),
      });

      if (aiResp.status === 429 || aiResp.status === 402) {
        return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Zu viele Anfragen. Bitte später erneut versuchen." : "AI-Guthaben aufgebraucht." }), {
          status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      const choice = aiJson?.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        finalReply = (choice?.content ?? "").toString();
        break;
      }

      // Add assistant tool-call message to context
      messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: toolCalls });

      let hasWrite = false;

      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { args = {}; }

        if (name === "query_cases") {
          let q = client.from("cases").select("case_no, project_name, client_name, status, urgency, due_at, departments:department_id(name)").eq("deleted", false);
          if (args.only_open) q = q.neq("status", "abgeschlossen");
          if (args.status) q = q.eq("status", args.status);
          if (args.min_urgency) q = q.gte("urgency", args.min_urgency);
          if (args.assignee_me) q = q.eq("assignee_id", user.id);
          if (args.overdue) q = q.lt("due_at", new Date().toISOString().slice(0,10)).neq("status", "abgeschlossen");
          const sort = args.sort_by ?? "urgency";
          const dir = (args.direction ?? "desc") === "asc";
          q = q.order(sort, { ascending: dir, nullsFirst: false }).limit(Math.min(args.limit ?? 10, 25));
          const { data: rows, error } = await q;
          const result = error ? { error: error.message } : (rows ?? []).map((r: any) => ({
            case_no: r.case_no, title: r.project_name, kunde: r.client_name,
            status: r.status, chilis: r.urgency, fällig: r.due_at, abteilung: r.departments?.name ?? null,
          }));
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
        } else {
          // Write tool: collect as proposal, feed acknowledgement back so model can summarize
          const action = { id: tc.id, tool: name, args, vorgang_id, status: "pending" };
          proposed_actions.push(action);
          hasWrite = true;
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify({ proposed: true, action }) });
        }
      }

      if (hasWrite) {
        // One more round so model writes a confirmation summary, then break.
        const aiResp2 = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
        });
        if (aiResp2.ok) {
          const j = await aiResp2.json();
          finalReply = j?.choices?.[0]?.message?.content ?? "Vorschlag erstellt. Bitte unten bestätigen.";
        } else {
          finalReply = "Vorschlag erstellt. Bitte unten bestätigen.";
        }
        break;
      }
      // else read-only tool – loop continues
    }

    const metadata = proposed_actions.length ? { proposed_actions } : null;

    const { data: inserted } = await client
      .from("ai_messages")
      .insert({ vorgang_id, user_id: user.id, role: "assistant", content: finalReply || "(leer)", metadata })
      .select()
      .single();

    return new Response(JSON.stringify({ reply: finalReply, message: inserted, proposed_actions }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-chat error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

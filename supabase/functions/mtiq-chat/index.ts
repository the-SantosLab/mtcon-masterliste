// MTIQ AI chat – with extended case context (chat, notes, activity, attachments),
// cross-case/project read tools, write tools as proposed_actions, and multimodal
// image analysis from case attachments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { loadPrompt } from "../_shared/ai-prompt.ts";

const DEFAULT_CHAT_PROMPT = `Du bist MTIQ, der KI-Assistent für die Masterliste (MTCON).
Stil: präzise, neutral, Deutsch, kurz, keine Floskeln, keine Emojis außer 🌶 für Chilis, kein Konjunktiv. Antworte direkt. Wenn etwas unklar ist, frage genau eine konkrete Rückfrage.

Werkzeuge:
- query_cases / report_cases / query_projects: lesend, vorgangs-/projektübergreifend (Filter, Aggregation, Berichte).
- set_case_status / set_case_urgency / set_case_assignee / create_subtask / update_subtask / add_case_note / post_case_chat / send_email: Änderungen am aktuellen Vorgang bzw. E-Mail-Versand VORSCHLAGEN. Diese werden NICHT direkt ausgeführt — der Nutzer muss bestätigen. Rufe das passende Tool, wenn der Nutzer eine Änderung verlangt, und beschreibe danach in 1–2 Sätzen, was zur Bestätigung vorgeschlagen wurde.
- Wenn dem aktuellen Vorgang Bilder anhängen, werden sie dir mit der Nachricht mitgeliefert. Analysiere sie sachlich und beschreibe relevante Inhalte.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Msg = { role: "user" | "assistant" | "system" | "tool"; content: any; tool_call_id?: string; tool_calls?: any[]; name?: string };

const chiliMap: Record<number, string> = { 1: "1🌶 niedrig", 2: "2🌶", 3: "3🌶 mittel", 4: "4🌶", 5: "5🌶 kritisch" };

// ---------- Tool schemas ----------
const tools = [
  {
    type: "function",
    function: {
      name: "query_cases",
      description: "Liest mehrere Vorgänge aus der Masterliste, gefiltert/sortiert. Nur lesend. Standardmäßig sind abgeschlossene und archivierte Vorgänge eingeschlossen, damit auch frühere/ähnliche Fälle aus dem Archiv gefunden werden.",
      parameters: {
        type: "object",
        properties: {
          sort_by: { type: "string", enum: ["urgency", "due_at", "created_at"] },
          direction: { type: "string", enum: ["asc", "desc"] },
          limit: { type: "integer", minimum: 1, maximum: 25 },
          status: { type: "string" },
          only_open: { type: "boolean", description: "Wenn true: archivierte/abgeschlossene Vorgänge ausschließen. Default false." },
          include_archived: { type: "boolean", description: "Default true. Wenn false, werden Status archiv/abgeschlossen/verworfen ausgeschlossen." },
          search_text: { type: "string", description: "Suche über Vorgangsnummer, Projektname, Kunde, Kundennummer und Notiz – inkl. Archiv." },
          min_urgency: { type: "integer", minimum: 1, maximum: 5 },
          assignee_me: { type: "boolean" },
          overdue: { type: "boolean" },
          department_name: { type: "string", description: "Abteilungsname (Teilstring, case-insensitive)" },
          project_id: { type: "string", description: "Filter nach Projekt-ID" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_cases",
      description: "Aggregierter Bericht über mehrere Vorgänge: Zählung & Gruppierung nach Abteilung, Status, Dringlichkeit, Zuständigem oder Projekt. Für Auswertungen, KPIs, Übersichten.",
      parameters: {
        type: "object",
        required: ["group_by"],
        properties: {
          group_by: { type: "string", enum: ["department", "status", "urgency", "assignee", "project"] },
          only_open: { type: "boolean" },
          overdue: { type: "boolean" },
          min_urgency: { type: "integer", minimum: 1, maximum: 5 },
          since_days: { type: "integer", minimum: 1, maximum: 365, description: "Nur Vorgänge erstellt in den letzten N Tagen" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_projects",
      description: "Listet Projekte mit Anzahl Vorgänge, optional gefiltert. Nur lesend. Archivierte und abgeschlossene Projekte sind standardmäßig enthalten, damit auch frühere/ähnliche Projekte aus dem Archiv gefunden werden.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "completed", "archived"] },
          include_archived: { type: "boolean", description: "Default true. Wenn false, werden archived/completed-Projekte ausgeschlossen." },
          name_like: { type: "string", description: "Teilstring im Projektnamen" },
          search_text: { type: "string", description: "Suche über Projektnummer, Name und Code – inkl. Archiv." },
          limit: { type: "integer", minimum: 1, maximum: 25 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_case_status",
      description: "Schlägt vor, den Status des aktuellen Vorgangs zu ändern. Wird dem Nutzer zur Bestätigung angezeigt.",
      parameters: { type: "object", required: ["status"], properties: { status: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "set_case_urgency",
      description: "Schlägt vor, die Chili-Anzahl (0-5) des aktuellen Vorgangs zu ändern.",
      parameters: { type: "object", required: ["urgency"], properties: { urgency: { type: "integer", minimum: 0, maximum: 5 } } },
    },
  },
  {
    type: "function",
    function: {
      name: "set_case_assignee",
      description: "Schlägt vor, den Zuständigen des aktuellen Vorgangs zu ändern. Entweder user_id (UUID) oder Name/Kürzel zum Auflösen angeben.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "UUID des neuen Zuständigen" },
          name_or_code: { type: "string", description: "Anzeigename oder short_code zum Auflösen, wenn user_id unbekannt" },
          unassign: { type: "boolean", description: "Wenn true: Zuweisung entfernen" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_subtask",
      description: "Schlägt vor, eine Unteraufgabe anzulegen.",
      parameters: {
        type: "object", required: ["title"],
        properties: { title: { type: "string" }, description: { type: "string" }, due_at: { type: "string" }, urgency: { type: "integer", minimum: 0, maximum: 5 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_subtask",
      description: "Schlägt vor, eine bestehende Unteraufgabe zu ändern.",
      parameters: {
        type: "object", required: ["subtask_id"],
        properties: { subtask_id: { type: "string" }, status: { type: "string" }, title: { type: "string" }, urgency: { type: "integer", minimum: 0, maximum: 5 } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_case_note",
      description: "Schlägt vor, eine Notiz hinzuzufügen.",
      parameters: { type: "object", required: ["body"], properties: { body: { type: "string" }, pinned: { type: "boolean" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "post_case_chat",
      description: "Schlägt vor, eine Nachricht im Vorgang-Chat zu posten.",
      parameters: { type: "object", required: ["body"], properties: { body: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Schlägt vor, eine E-Mail über das MTCON-Postfach (noreply@kscommand.com) zu senden. Empfänger, Betreff und Inhalt sind erforderlich.",
      parameters: {
        type: "object",
        required: ["to", "subject", "body"],
        properties: {
          to: { type: "string", description: "Empfänger-E-Mail-Adresse" },
          subject: { type: "string" },
          body: { type: "string", description: "Klartext-Inhalt (Zeilenumbrüche erlaubt)" },
        },
      },
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

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const vorgang_id: string | null = body.vorgang_id ?? null;
    const userMessage: string = (body.message ?? "").toString();
    if (!vorgang_id || !userMessage.trim()) {
      return new Response(JSON.stringify({ error: "vorgang_id and message required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Load current case context ----
    const { data: caseRow } = await client
      .from("cases")
      .select("id, case_no, project_name, client_name, status, note, due_at, received_at, estimated_hours, urgency, assignee_id, customer_no, project_id, departments:department_id(id,name)")
      .eq("id", vorgang_id)
      .maybeSingle();

    if (!caseRow) {
      return new Response(JSON.stringify({ error: "Vorgang nicht gefunden oder kein Zugriff" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [
      { data: subtasks },
      { data: notes },
      { data: activity },
      { data: chat },
      { data: history },
      { data: meProfile },
      { data: chatAtts },
      { data: noteAtts },
      { data: emailAtts },
      { data: assigneeProfile },
    ] = await Promise.all([
      client.from("case_tasks").select("id, title, status, urgency, assigned_to, due_at").eq("case_id", vorgang_id).order("sort_order", { ascending: true }).limit(50),
      client.from("case_notes").select("body, pinned, author_id, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(10),
      client.from("case_activity").select("action, field, old_value, new_value, message, created_at, actor_id").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(20),
      client.from("case_chat_messages").select("body, author_id, created_at, system_kind").eq("case_id", vorgang_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(20),
      client.from("ai_messages").select("role, content").eq("vorgang_id", vorgang_id).eq("user_id", user.id).order("created_at", { ascending: true }).limit(30),
      client.from("users_profile").select("display_name, short_code").eq("id", user.id).maybeSingle(),
      client.from("case_chat_attachments").select("id, file_name, mime_type, storage_path, size_bytes, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(20),
      client.from("case_note_attachments").select("id, file_name, mime_type, storage_path, size_bytes, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(20),
      client.from("case_email_attachments").select("id, file_name, mime_type, storage_path, size_bytes, created_at").eq("case_id", vorgang_id).order("created_at", { ascending: false }).limit(20),
      caseRow.assignee_id
        ? client.from("users_profile").select("display_name, short_code").eq("id", caseRow.assignee_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Persist user message
    await client.from("ai_messages").insert({
      vorgang_id, user_id: user.id, role: "user", content: userMessage, read_at: new Date().toISOString(),
    });

    const caseChili = caseRow.urgency ? (chiliMap[caseRow.urgency] ?? `${caseRow.urgency}🌶`) : "nicht gesetzt";
    const deptName = (caseRow as any).departments?.name ?? "-";
    const assigneeLabel = assigneeProfile
      ? `${(assigneeProfile as any).display_name ?? "-"} (${(assigneeProfile as any).short_code ?? "-"}, id ${caseRow.assignee_id})`
      : "nicht zugewiesen";

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

    // ---- Attachments: build combined list + signed URLs for images ----
    type Att = { id: string; file_name: string; mime_type: string | null; storage_path: string; size_bytes: number | null; source: string };
    const allAtts: Att[] = [
      ...((chatAtts ?? []) as any[]).map(a => ({ ...a, source: "chat" })),
      ...((noteAtts ?? []) as any[]).map(a => ({ ...a, source: "notiz" })),
      ...((emailAtts ?? []) as any[]).map(a => ({ ...a, source: "email" })),
    ];
    const imageAtts = allAtts.filter(a => (a.mime_type ?? "").startsWith("image/")).slice(0, 4);
    let signedImages: { att: Att; url: string }[] = [];
    if (imageAtts.length) {
      const { data: sd } = await (client as any).storage.from("case-attachments").createSignedUrls(imageAtts.map(a => a.storage_path), 600);
      signedImages = imageAtts.map((a, i) => ({ att: a, url: (sd?.[i] as any)?.signedUrl })).filter(x => x.url);
    }
    const attachmentLines = allAtts.length
      ? allAtts.slice(0, 30).map(a => `  • [${a.source}] ${a.file_name} (${a.mime_type ?? "?"}${a.size_bytes ? `, ${Math.round(a.size_bytes/1024)} KB` : ""})`).join("\n")
      : "  keine";

    const chatBasePrompt = await loadPrompt("mtiq_chat", DEFAULT_CHAT_PROMPT);
    const systemPrompt = `${chatBasePrompt}

Aktueller Nutzer: ${meProfile?.display_name ?? user.email} (${meProfile?.short_code ?? "-"}, id ${user.id})

Aktueller Vorgang:
- ID: ${caseRow.id}
- Nummer: ${caseRow.case_no}
- Titel: ${caseRow.project_name}
- Kunde: ${caseRow.client_name ?? "-"} (${caseRow.customer_no ?? "-"})
- Abteilung: ${deptName}
- Status: ${caseRow.status}
- Chilis: ${caseChili}
- Zuständig: ${assigneeLabel}
- Projekt-ID: ${caseRow.project_id ?? "-"}
- Eingang: ${caseRow.received_at ?? "-"} | Fällig: ${caseRow.due_at ?? "-"} | Geschätzt: ${caseRow.estimated_hours ?? "-"} h
- Notizfeld: ${(caseRow.note ?? "").slice(0, 600)}

Unteraufgaben (${subtasks?.length ?? 0}):
${subtaskLines}

Letzte Notizen:
${noteLines}

Letzte Vorgang-Chat Nachrichten:
${chatLines}

Letzte Aktivitäten:
${activityLines}

Anhänge (${allAtts.length}):
${attachmentLines}
${signedImages.length ? `\n(${signedImages.length} Bild-Anhänge sind als Vorschau mit deiner Nutzernachricht beigefügt.)` : ""}`;

    // Build multimodal user content (text + images) when images exist
    const userContent: any = signedImages.length
      ? [
          { type: "text", text: userMessage },
          ...signedImages.map(s => ({ type: "image_url", image_url: { url: s.url } })),
        ]
      : userMessage;

    const messages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...((history ?? []) as Msg[]).map(h => ({ role: h.role, content: h.content })),
      { role: "user", content: userContent },
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
        return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiJson = await aiResp.json();
      const choice = aiJson?.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls;

      if (!toolCalls || toolCalls.length === 0) {
        finalReply = (choice?.content ?? "").toString();
        break;
      }

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
          if (args.project_id) q = q.eq("project_id", args.project_id);
          if (args.overdue) q = q.lt("due_at", new Date().toISOString().slice(0,10)).neq("status", "abgeschlossen");
          const sort = args.sort_by ?? "urgency";
          const dir = (args.direction ?? "desc") === "asc";
          q = q.order(sort, { ascending: dir, nullsFirst: false }).limit(Math.min(args.limit ?? 10, 25));
          const { data: rows, error } = await q;
          let filtered = rows ?? [];
          if (args.department_name) {
            const needle = String(args.department_name).toLowerCase();
            filtered = filtered.filter((r: any) => (r.departments?.name ?? "").toLowerCase().includes(needle));
          }
          const result = error ? { error: error.message } : filtered.map((r: any) => ({
            case_no: r.case_no, title: r.project_name, kunde: r.client_name,
            status: r.status, chilis: r.urgency, fällig: r.due_at, abteilung: r.departments?.name ?? null,
          }));
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
        } else if (name === "report_cases") {
          let q = client.from("cases").select("status, urgency, assignee_id, project_id, due_at, created_at, departments:department_id(name)").eq("deleted", false);
          if (args.only_open) q = q.neq("status", "abgeschlossen");
          if (args.min_urgency) q = q.gte("urgency", args.min_urgency);
          if (args.overdue) q = q.lt("due_at", new Date().toISOString().slice(0,10)).neq("status", "abgeschlossen");
          if (args.since_days) {
            const since = new Date(Date.now() - args.since_days * 86400000).toISOString();
            q = q.gte("created_at", since);
          }
          q = q.limit(1000);
          const { data: rows, error } = await q;
          let result: any;
          if (error) {
            result = { error: error.message };
          } else {
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
            // resolve assignee/project labels if applicable
            if (args.group_by === "assignee") {
              const ids = Object.keys(buckets).filter(k => k.length === 36);
              if (ids.length) {
                const { data: profs } = await client.from("users_profile").select("id, display_name, short_code").in("id", ids);
                const map = new Map<string, string>((profs ?? []).map((p: any) => [p.id, `${p.display_name ?? "?"} (${p.short_code ?? "-"})`]));
                const relabeled: Record<string, number> = {};
                for (const [k, v] of Object.entries(buckets)) relabeled[map.get(k) ?? k] = v;
                result = { total: rows?.length ?? 0, group_by: args.group_by, counts: relabeled };
              } else result = { total: rows?.length ?? 0, group_by: args.group_by, counts: buckets };
            } else if (args.group_by === "project") {
              const ids = Object.keys(buckets).filter(k => k.length === 36);
              if (ids.length) {
                const { data: projs } = await client.from("projects").select("id, name, project_number").in("id", ids);
                const map = new Map<string, string>((projs ?? []).map((p: any) => [p.id, `${p.project_number ?? p.name}`]));
                const relabeled: Record<string, number> = {};
                for (const [k, v] of Object.entries(buckets)) relabeled[map.get(k) ?? k] = v;
                result = { total: rows?.length ?? 0, group_by: args.group_by, counts: relabeled };
              } else result = { total: rows?.length ?? 0, group_by: args.group_by, counts: buckets };
            } else {
              result = { total: rows?.length ?? 0, group_by: args.group_by, counts: buckets };
            }
          }
          messages.push({ role: "tool", tool_call_id: tc.id, name, content: JSON.stringify(result) });
        } else if (name === "query_projects") {
          let q = client.from("projects").select("id, name, project_number, status, urgency, department_id, departments:department_id(name)");
          if (args.status) q = q.eq("status", args.status);
          if (args.name_like) q = q.ilike("name", `%${args.name_like}%`);
          q = q.order("urgency", { ascending: false, nullsFirst: false }).limit(Math.min(args.limit ?? 10, 25));
          const { data: rows, error } = await q;
          let result: any = error ? { error: error.message } : [];
          if (!error && rows) {
            // attach case counts per project (only for the user-readable ones)
            const ids = rows.map((r: any) => r.id);
            const { data: cs } = await client.from("cases").select("project_id, status").in("project_id", ids).eq("deleted", false);
            const counts: Record<string, { total: number; open: number }> = {};
            for (const c of cs ?? []) {
              const k = (c as any).project_id;
              const e = counts[k] ?? (counts[k] = { total: 0, open: 0 });
              e.total++; if (c.status !== "abgeschlossen") e.open++;
            }
            result = rows.map((r: any) => ({
              id: r.id,
              nummer: r.project_number,
              name: r.name,
              status: r.status,
              chilis: r.urgency,
              abteilung: r.departments?.name ?? null,
              vorgaenge_gesamt: counts[r.id]?.total ?? 0,
              vorgaenge_offen: counts[r.id]?.open ?? 0,
            }));
          }
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

// MTIQ Approve Draft: turn a pending mtiq_draft into a real Vorgang + Unteraufgaben.
// Runs with the user's JWT so RLS / triggers attribute correctly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRIORITY_TO_URGENCY: Record<string, number> = {
  "Niedrig": 1,
  "Mittel": 2,
  "Hoch": 4,
  "Kritisch": 5,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await client.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const draft_id: string = body.draft_id;
    if (!draft_id) {
      return new Response(JSON.stringify({ error: "draft_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: draft, error: dErr } = await client
      .from("mtiq_drafts")
      .select("*")
      .eq("id", draft_id)
      .eq("status", "pending")
      .maybeSingle();
    if (dErr) throw dErr;
    if (!draft) {
      return new Response(JSON.stringify({ error: "Entwurf nicht gefunden oder bereits verarbeitet" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve department:
    //  1) explicit team (sub-department) wins,
    //  2) then explicit draft_department_id (if you ever pass one),
    //  3) finally an EXACT (case-insensitive) name match against the chosen department —
    //     never a fuzzy LIKE, because "%IT%" matches dozens of departments and silently
    //     overrides the user's selection.
    let department_id: string | null = draft.draft_team_id ?? null;
    if (!department_id && draft.draft_department) {
      const needle = String(draft.draft_department).trim();
      const { data: deptMatches } = await client
        .from("departments")
        .select("id, name, parent_id")
        .ilike("name", needle)
        .order("parent_id", { ascending: true, nullsFirst: true })
        .limit(1);
      if (deptMatches && deptMatches[0]) department_id = deptMatches[0].id;
    }


    const urgency = PRIORITY_TO_URGENCY[draft.draft_priority ?? "Mittel"] ?? 2;

    // Load template (if any) to inherit workflow settings + tasks
    let templateSettings: { sequential_mode: boolean; due_required: boolean; lock_mode: string } | null = null;
    let templateTasks: any[] = [];
    if (draft.draft_template_id) {
      const { data: tpl } = await client
        .from("case_templates")
        .select("id, sequential_mode, due_required, lock_mode")
        .eq("id", draft.draft_template_id)
        .maybeSingle();
      if (tpl) {
        templateSettings = {
          sequential_mode: tpl.sequential_mode,
          due_required: tpl.due_required,
          lock_mode: tpl.lock_mode,
        };
        const { data: tplTasks } = await client
          .from("case_template_tasks")
          .select("title, description, department_id, order_index")
          .eq("template_id", tpl.id)
          .order("order_index", { ascending: true });
        templateTasks = tplTasks ?? [];
      }
    }

    // Create case
    const { data: newCase, error: cErr } = await client
      .from("cases")
      .insert({
        project_name: draft.draft_title ?? "(ohne Titel)",
        note: draft.draft_description ?? null,
        department_id,
        assignee_id: draft.draft_assignee_id ?? null,
        project_id: draft.draft_project_id ?? null,
        urgency,
        due_at: draft.draft_due_date,
        received_at: draft.draft_received_at ?? new Date().toISOString().slice(0, 10),
        status: "nicht_begonnen",
        created_by: user.id,
        customer_no: draft.draft_customer_no ?? null,
        client_name: draft.draft_client_name ?? null,
        product_code: draft.draft_product_code ?? null,
        internal_area_code: draft.draft_internal_area_code ?? null,
        project_article_no: draft.draft_project_article_no ?? null,
        estimated_hours: draft.draft_estimated_hours ?? null,
        sop: draft.draft_sop ?? null,
        quantity: draft.draft_quantity ?? null,
        project_duration: draft.draft_project_duration ?? null,
        sequential_mode: templateSettings?.sequential_mode ?? false,
        due_required: templateSettings?.due_required ?? false,
        lock_mode: templateSettings?.lock_mode ?? "hard",
      })
      .select("id, case_no")
      .single();
    if (cErr) throw cErr;

    // Subtasks: prefer template tasks if a template was chosen, else MTIQ-suggested tasks
    let taskRows: any[] = [];
    if (templateTasks.length) {
      taskRows = templateTasks.map((t: any, idx: number) => ({
        case_id: newCase.id,
        title: String(t.title ?? "").slice(0, 500) || `Aufgabe ${idx + 1}`,
        description: t.description ?? null,
        department_id: t.department_id ?? department_id,
        status: "open",
        sort_order: idx,
        created_by: user.id,
      }));
    } else {
      const tasks: any[] = Array.isArray(draft.draft_tasks) ? draft.draft_tasks : [];
      taskRows = await Promise.all(tasks.map(async (t: any, idx: number) => {
        let task_dept_id: string | null = department_id;
        if (t.department) {
          const { data: dm } = await client
            .from("departments")
            .select("id, parent_id")
            .ilike("name", String(t.department).trim())
            .order("parent_id", { ascending: true, nullsFirst: true })
            .limit(1);
          if (dm && dm[0]) task_dept_id = dm[0].id;
        }

        return {
          case_id: newCase.id,
          title: String(t.title ?? "").slice(0, 500) || `Aufgabe ${idx + 1}`,
          description: t.assignee_hint ? `Hinweis: ${t.assignee_hint}` : null,
          department_id: task_dept_id,
          assigned_to: t.assignee_id ?? null,
          due_at: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          status: "open",
          sort_order: idx,
          created_by: user.id,
        };
      }));
    }
    if (taskRows.length) {
      const { error: tErr } = await client.from("case_tasks").insert(taskRows);
      if (tErr) console.error("subtasks insert error", tErr);
    }

    // Optional pinned note from the draft
    if (draft.draft_note && String(draft.draft_note).trim()) {
      const { error: nErr } = await client.from("case_notes").insert({
        case_id: newCase.id,
        author_id: user.id,
        body: String(draft.draft_note),
        pinned: true,
      });
      if (nErr) console.error("note insert error", nErr);
    }

    // Pinned note from the editable MTIQ-merged note field (preferred), with AI-merge fallback.
    try {
      const desc = String(draft.draft_description ?? "").trim();
      const reason = String((draft as any).mtiq_reasoning ?? "").trim();
      const userNote = String((draft as any).mtiq_generated_note ?? "").trim();
      let mergedBody = userNote;

      if (!mergedBody && (desc || reason)) {
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (LOVABLE_API_KEY && desc && reason) {
          const sys = "Du bist ein neutraler Assistent für interne Vorgangsnotizen. Verbinde die Beschreibung und die Strukturierungs-Begründung von MTIQ zu EINER kompakten, sachlichen Notiz auf Deutsch (max. 6 Sätze). Keine Floskeln, keine Emojis, keine Marketingsprache, keine Überschriften. Gib NUR den Notiztext zurück.";
          const usr = `BESCHREIBUNG:\n${desc}\n\nWARUM SO STRUKTURIERT:\n${reason}`;
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
            }),
          });
          if (aiRes.ok) {
            const j = await aiRes.json();
            mergedBody = String(j.choices?.[0]?.message?.content ?? "").trim();
          } else {
            console.warn("AI merge non-OK", aiRes.status);
          }
        }
        if (!mergedBody) {
          mergedBody = [desc, reason && `**Warum so strukturiert:** ${reason}`].filter(Boolean).join("\n\n");
        }
      }

      if (mergedBody) {
        const { error: mErr } = await client.from("case_notes").insert({
          case_id: newCase.id,
          author_id: user.id,
          body: mergedBody,
          pinned: true,
        });
        if (mErr) console.error("merged note insert error", mErr);
      }
    } catch (mergeErr) {
      console.error("merged note generation failed (non-fatal)", mergeErr);
    }

    // Mark draft approved
    await client.from("mtiq_drafts").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      vorgang_id: newCase.id,
    }).eq("id", draft_id);

    // Log corrections (diff between original AI snapshot and final draft state).
    // Enables few-shot "learning from corrections" in future intakes.
    try {
      const orig = (draft as any).original_snapshot;
      if (orig && typeof orig === "object") {
        const finalState = {
          title: draft.draft_title,
          description: draft.draft_description,
          department: draft.draft_department,
          priority: draft.draft_priority,
          due_date: draft.draft_due_date,
          tasks: draft.draft_tasks,
        };
        const origFields: Record<string, unknown> = {};
        const corrFields: Record<string, unknown> = {};
        for (const k of Object.keys(finalState)) {
          const a = JSON.stringify((orig as any)[k] ?? null);
          const b = JSON.stringify((finalState as any)[k] ?? null);
          if (a !== b) {
            origFields[k] = (orig as any)[k] ?? null;
            corrFields[k] = (finalState as any)[k] ?? null;
          }
        }
        if (Object.keys(origFields).length > 0) {
          await client.from("mtiq_draft_corrections").insert({
            draft_id,
            original_fields: origFields,
            corrected_fields: corrFields,
            created_by: user.id,
          });
        }
      }
    } catch (logErr) {
      console.error("correction log failed (non-fatal)", logErr);
    }

    return new Response(JSON.stringify({ vorgang_id: newCase.id, case_no: newCase.case_no }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-approve-draft error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

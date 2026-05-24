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

    // Resolve department
    let department_id: string | null = null;
    if (draft.draft_department) {
      const needle = String(draft.draft_department).trim();
      const { data: deptMatches } = await client
        .from("departments")
        .select("id, name")
        .ilike("name", `%${needle}%`)
        .limit(1);
      if (deptMatches && deptMatches[0]) department_id = deptMatches[0].id;
    }

    const urgency = PRIORITY_TO_URGENCY[draft.draft_priority ?? "Mittel"] ?? 2;

    // Create case
    const { data: newCase, error: cErr } = await client
      .from("cases")
      .insert({
        project_name: draft.draft_title ?? "(ohne Titel)",
        note: draft.draft_description ?? null,
        department_id,
        urgency,
        due_at: draft.draft_due_date,
        status: "nicht_begonnen",
        created_by: user.id,
        received_at: new Date().toISOString().slice(0, 10),
      })
      .select("id, case_no")
      .single();
    if (cErr) throw cErr;

    // Create subtasks
    const tasks: any[] = Array.isArray(draft.draft_tasks) ? draft.draft_tasks : [];
    if (tasks.length) {
      const rows = await Promise.all(tasks.map(async (t: any, idx: number) => {
        let task_dept_id: string | null = department_id;
        if (t.department) {
          const { data: dm } = await client
            .from("departments").select("id").ilike("name", `%${String(t.department).trim()}%`).limit(1);
          if (dm && dm[0]) task_dept_id = dm[0].id;
        }
        return {
          case_id: newCase.id,
          title: String(t.title ?? "").slice(0, 500) || `Aufgabe ${idx + 1}`,
          description: t.assignee_hint ? `Hinweis: ${t.assignee_hint}` : null,
          department_id: task_dept_id,
          due_at: t.due_date && /^\d{4}-\d{2}-\d{2}$/.test(t.due_date) ? t.due_date : null,
          status: "open",
          sort_order: idx,
          created_by: user.id,
        };
      }));
      const { error: tErr } = await client.from("case_tasks").insert(rows);
      if (tErr) console.error("subtasks insert error", tErr);
    }

    // Mark draft approved
    await client.from("mtiq_drafts").update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      vorgang_id: newCase.id,
    }).eq("id", draft_id);

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

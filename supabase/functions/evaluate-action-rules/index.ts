// Evaluate active action_rules against an inbox_document.
// Supports triggers: on_classify, on_confirm, on_field_match, on_schedule (caller passes trigger).
// Supported actions v1: create_notification, create_case, send_webhook.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function evalCondition(cond: any, data: any, doc: any): boolean {
  const field = cond?.field;
  const op = cond?.op;
  const expected = cond?.value;
  const actual = field === "_type_code"
    ? doc?._type_code
    : field === "_confidence"
    ? doc?.classification_confidence
    : getByPath(data, field);

  switch (op) {
    case "eq": return actual == expected;
    case "neq": return actual != expected;
    case "gt": return Number(actual) > Number(expected);
    case "gte": return Number(actual) >= Number(expected);
    case "lt": return Number(actual) < Number(expected);
    case "lte": return Number(actual) <= Number(expected);
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    case "exists": return actual !== undefined && actual !== null && actual !== "";
    case "not_exists": return actual === undefined || actual === null || actual === "";
    case "in_days": {
      // actual is date string YYYY-MM-DD, expected is number of days from now
      if (!actual) return false;
      const target = new Date(String(actual));
      if (isNaN(target.getTime())) return false;
      const diffDays = Math.round((target.getTime() - Date.now()) / 86400000);
      return diffDays >= 0 && diffDays <= Number(expected);
    }
    default: return false;
  }
}

function evalConditions(conditions: any[], data: any, doc: any): boolean {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((c) => evalCondition(c, data, doc));
}

async function executeAction(action: any, doc: any, ruleId: string): Promise<{ ok: boolean; error?: string; payload?: any }> {
  const type = action?.type;
  try {
    if (type === "create_notification") {
      const target = action.target || "admin"; // 'admin' or specific user uuid
      const title = String(action.title || "Inbox-Regel: Aktion").slice(0, 300);
      const bodyText = String(action.body || `Dokument ${doc.inbox_no || doc.id}`).slice(0, 500);
      const href = action.href || `/inbox?doc=${doc.id}`;
      let recipients: string[] = [];
      if (target === "admin") {
        const { data } = await admin.from("user_roles").select("user_id").eq("role", "admin");
        recipients = (data || []).map((r: any) => r.user_id);
      } else if (typeof target === "string") {
        recipients = [target];
      }
      for (const uid of recipients) {
        await admin.from("notifications").insert({
          user_id: uid, type: "inbox_rule", title, body: bodyText, href,
        });
      }
      return { ok: true, payload: { notified: recipients.length } };
    }

    if (type === "send_webhook") {
      const url = action.url;
      if (!url) return { ok: false, error: "missing url" };
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inbox_no: doc.inbox_no,
          subject: doc.subject,
          from_email: doc.from_email,
          extracted: doc.extracted_data,
          confidence: doc.classification_confidence,
        }),
      });
      return { ok: resp.ok, error: resp.ok ? undefined : `HTTP ${resp.status}`, payload: { status: resp.status } };
    }

    if (type === "create_case") {
      const title = String(action.title || doc.subject || "Inbox-Vorgang").slice(0, 300);
      const department = action.department || null;
      const insertObj: any = {
        project_name: title,
        note: `Aus Inbox-Dokument ${doc.inbox_no}\n\n${doc.classification_reasoning || ""}`,
        status: "todo",
        source: "inbox",
      };
      if (department) insertObj.department_id = department;
      const { data, error } = await admin.from("cases").insert(insertObj).select("id, case_no").single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, payload: { case_id: data.id, case_no: data.case_no } };
    }

    return { ok: false, error: `unknown action type: ${type}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* noop */ }
  const { inbox_document_id, trigger = "on_classify" } = body;
  if (!inbox_document_id) {
    return new Response(JSON.stringify({ error: "inbox_document_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: doc } = await admin
    .from("inbox_documents").select("*, document_types:classified_type_id(code)").eq("id", inbox_document_id).maybeSingle();
  if (!doc) {
    return new Response(JSON.stringify({ error: "doc not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const typeCode = doc?.document_types?.code;
  const docCtx = { ...doc, _type_code: typeCode };

  const { data: rules } = await admin
    .from("action_rules")
    .select("*")
    .eq("is_active", true)
    .eq("trigger", trigger)
    .or(`document_type_id.is.null,document_type_id.eq.${doc.classified_type_id || "00000000-0000-0000-0000-000000000000"}`);

  const results: any[] = [];
  for (const rule of rules || []) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (!evalConditions(conditions, doc.extracted_data || {}, docCtx)) {
      await admin.from("action_executions").insert({
        rule_id: rule.id, inbox_document_id, action_type: null,
        result: "skipped", payload: { reason: "conditions_not_met" },
      });
      continue;
    }
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    for (const action of actions) {
      const res = await executeAction(action, doc, rule.id);
      await admin.from("action_executions").insert({
        rule_id: rule.id, inbox_document_id, action_type: action?.type,
        result: res.ok ? "success" : "failed",
        error_message: res.error || null, payload: res.payload || null,
      });
      results.push({ rule: rule.name, action: action?.type, ok: res.ok, error: res.error });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

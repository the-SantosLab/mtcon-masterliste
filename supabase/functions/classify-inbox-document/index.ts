// Classify an inbox_document via Lovable AI Gateway (Gemini 2.5 Pro).
// Picks the best matching document_type, extracts fields per that type's schema,
// uses recent inbox_corrections as few-shot examples, and writes results back.
// Then triggers evaluate-action-rules.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: { inbox_document_id?: string } = {};
  try { body = await req.json(); } catch { /* noop */ }
  const id = body.inbox_document_id;
  if (!id) {
    return new Response(JSON.stringify({ error: "inbox_document_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load doc
  const { data: doc, error: docErr } = await admin
    .from("inbox_documents").select("*").eq("id", id).maybeSingle();
  if (docErr || !doc) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load active types
  const { data: types } = await admin
    .from("document_types").select("*").eq("is_active", true).order("sort_order");
  if (!types || types.length === 0) {
    return new Response(JSON.stringify({ error: "no_active_types" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Load PDF if available
  let pdfBase64: string | null = null;
  if (doc.storage_path) {
    try {
      const { data: file } = await admin.storage.from("inbox-documents").download(doc.storage_path);
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        pdfBase64 = btoa(bin);
      }
    } catch (e) {
      console.error("pdf download failed", e);
    }
  }

  if (!LOVABLE_API_KEY) {
    await admin.from("inbox_documents").update({
      status: "failed", error_message: "LOVABLE_API_KEY missing",
    }).eq("id", id);
    return new Response(JSON.stringify({ error: "no_api_key" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const typesSummary = types.map((t: any) =>
    `- code: "${t.code}" | label: ${t.label_de}${t.classification_hints ? ` | hints: ${t.classification_hints}` : ""}`
  ).join("\n");

  const schemasSection = types.map((t: any) => {
    const schema = Array.isArray(t.extraction_schema) ? t.extraction_schema : [];
    const fields = schema.map((f: any) =>
      `    - ${f.key} (${f.type}${f.required ? ", required" : ""})${f.description ? ` — ${f.description}` : ""}`
    ).join("\n");
    return `Type "${t.code}" extraction fields:\n${fields || "    (no fields)"}`;
  }).join("\n\n");

  // Few-shot: last 10 corrections across all types (compact)
  const { data: corrections } = await admin
    .from("inbox_corrections")
    .select("field_path, ai_value, user_value, document_type_id")
    .order("corrected_at", { ascending: false })
    .limit(10);

  const fewShot = corrections && corrections.length > 0
    ? `\n\nRecent user corrections (learn from these to extract more accurately):\n` +
      corrections.map((c: any) =>
        `- field "${c.field_path}": AI said ${JSON.stringify(c.ai_value)}, user corrected to ${JSON.stringify(c.user_value)}`
      ).join("\n")
    : "";

  const systemPrompt = `You are an intelligent document classification and extraction engine for an internal business application (German). You will:
1. Classify the document into ONE of the available types below (or "other" if none fit).
2. Extract structured fields according to that type's schema.
3. Return a confidence score 0..1 and reasoning.

Available document types:
${typesSummary}

${schemasSection}${fewShot}

Respond with ONLY valid JSON in this exact shape:
{
  "type_code": "string (one of the codes above)",
  "confidence": 0.0,
  "reasoning": "2-3 sentence explanation in German",
  "extracted": { ...fields per the chosen type's schema... }
}

Rules:
- Dates as YYYY-MM-DD or null.
- Numbers as numeric (not strings) when possible.
- Arrays (like order items) as arrays of objects.
- If a field can't be determined, omit it or use null.
- All free-text values in German.`;

  const userParts: any[] = [
    { type: "text", text: `Subject: ${doc.subject || "(none)"}\nFrom: ${doc.from_name ? `${doc.from_name} <${doc.from_email}>` : doc.from_email || "unknown"}\n\nClassify and extract.` }
  ];
  if (pdfBase64) {
    userParts.push({
      type: "file",
      file: { filename: doc.filename || "document.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` },
    });
  }

  let aiResult: any = null;
  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiResp.ok) {
      const text = await aiResp.text();
      console.error("AI gateway error", aiResp.status, text);
      await admin.from("inbox_documents").update({
        status: "failed", error_message: `AI error ${aiResp.status}: ${text.slice(0, 500)}`,
      }).eq("id", id);
      return new Response(JSON.stringify({ error: "ai_error", status: aiResp.status }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    try { aiResult = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) aiResult = JSON.parse(m[0]);
    }
  } catch (e: any) {
    console.error("AI call failed", e);
    await admin.from("inbox_documents").update({
      status: "failed", error_message: `AI call failed: ${e?.message ?? e}`,
    }).eq("id", id);
    return new Response(JSON.stringify({ error: "ai_failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const typeCode = String(aiResult?.type_code || "other");
  const matchedType = types.find((t: any) => t.code === typeCode) || types.find((t: any) => t.code === "other") || types[0];
  const confidence = Math.max(0, Math.min(1, Number(aiResult?.confidence ?? 0)));
  const reasoning = String(aiResult?.reasoning || "").slice(0, 2000);
  const extracted = aiResult?.extracted && typeof aiResult.extracted === "object" ? aiResult.extracted : {};

  await admin.from("inbox_documents").update({
    classified_type_id: matchedType.id,
    classification_confidence: confidence,
    classification_reasoning: reasoning,
    extracted_data: extracted,
    status: "auto_classified",
    error_message: null,
  }).eq("id", id);

  // Fire & forget rule evaluation
  fetch(`${SUPABASE_URL}/functions/v1/evaluate-action-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
    body: JSON.stringify({ inbox_document_id: id, trigger: "on_classify" }),
  }).catch((e) => console.error("rule eval fire-and-forget failed", e));

  return new Response(JSON.stringify({
    ok: true, type_code: matchedType.code, confidence, reasoning,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

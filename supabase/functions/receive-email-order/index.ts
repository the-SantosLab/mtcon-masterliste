// Postmark Inbound Webhook -> Order Intake
// Receives an email with PDF attachment(s), extracts order fields + line items via AI,
// stores PDF in `order-documents` bucket, creates draft `orders` row + `order_items`.
//
// Auth: Basic Auth (username "postmark", password = POSTMARK_WEBHOOK_SECRET)
// Routed here from `receive-email-mtiq` when MailboxHash = "orders"/"bestellung"/"order"
// or the recipient address starts with "orders@" / "bestellung@" / "order@".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("POSTMARK_WEBHOOK_SECRET")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const SYSTEM_PROMPT = `Du bist ein Assistent zur Extraktion strukturierter Daten aus deutschen Bestellungen, Auftragsbestätigungen oder Angeboten (PDF).
Gib NUR valides JSON zurück, exakt mit diesem Schema:
{
  "order_kind": "new|change|cancellation|other",
  "customer_name": "Kundenname oder null",
  "customer_email": "E-Mail oder null",
  "customer_no": "Kundennummer oder null",
  "external_order_no": "Bestellnummer des Kunden oder null",
  "order_date": "YYYY-MM-DD oder null",
  "delivery_date": "YYYY-MM-DD oder null",
  "payment_terms": "z.B. '30 Tage netto' oder null",
  "currency": "EUR|USD|... default EUR",
  "subtotal_amount": Zahl oder null,
  "tax_amount": Zahl oder null,
  "total_amount": Zahl oder null,
  "items": [
    {
      "position": 1,
      "sku": "Artikelnummer oder null",
      "description": "Artikelbezeichnung",
      "quantity": Zahl,
      "unit": "Stk|kg|h|... oder null",
      "unit_price": Zahl oder null,
      "line_total": Zahl oder null,
      "tax_rate": Zahl oder null
    }
  ],
  "tags": ["Stichwort1", "Stichwort2"],
  "reasoning": "1-2 Sätze, Begründung der Klassifikation"
}
Wenn Daten nicht im Dokument stehen, nutze null. Halluziniere nichts. Positionen vollständig erfassen.`;

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: { ...corsHeaders, "WWW-Authenticate": 'Basic realm="postmark"' },
  });
}

function checkAuth(req: Request): boolean {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("basic ")) return false;
  try {
    const decoded = atob(h.slice(6).trim());
    const idx = decoded.indexOf(":");
    if (idx === -1) return false;
    return decoded.slice(idx + 1) === WEBHOOK_SECRET && WEBHOOK_SECRET.length > 0;
  } catch {
    return false;
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "bestellung.pdf";
}

function b64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function extractWithAI(pdfB64: string, filename: string): Promise<any> {
  if (!LOVABLE_API_KEY) return {};
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Analysiere folgende Bestellung (Dateiname: ${filename}). Antworte nur mit JSON.` },
              { type: "file", file: { filename, file_data: `data:application/pdf;base64,${pdfB64}` } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      console.error("AI gateway error", resp.status, await resp.text());
      return {};
    }
    const json = await resp.json();
    const raw = json?.choices?.[0]?.message?.content ?? "{}";
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : {};
    }
  } catch (e) {
    console.error("AI extract failed", e);
    return {};
  }
}

function clamp<T>(v: T | undefined | null, def: T | null = null): T | null {
  return (v ?? def) as T | null;
}
function safeDate(v: any): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  if (!checkAuth(req)) return unauthorized();

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const messageId: string | null = payload?.MessageID || payload?.MessageId || null;
  const subject: string = payload?.Subject || "(kein Betreff)";
  const fromEmail: string = payload?.FromFull?.Email || payload?.From || "unknown";
  const attachments: any[] = Array.isArray(payload?.Attachments) ? payload.Attachments : [];

  const pdfs = attachments.filter((a) => {
    const ct = String(a?.ContentType || "").toLowerCase();
    const nm = String(a?.Name || "").toLowerCase();
    return ct === "application/pdf" || nm.endsWith(".pdf");
  });

  if (pdfs.length === 0) {
    return new Response(JSON.stringify({ status: "no_pdf", message: "Keine PDF-Anhänge gefunden" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const year = new Date().getFullYear().toString();
  const created: Array<{ order_id: string; order_no?: string; file: string }> = [];
  const errors: any[] = [];

  for (const att of pdfs) {
    try {
      const filename = safeFilename(att?.Name || "bestellung.pdf");
      const b64: string = att?.Content || "";
      if (!b64) continue;
      const bytes = b64ToUint8(b64);
      const fileSize = bytes.byteLength;
      const uid = crypto.randomUUID();
      const storagePath = `intake/${year}/${uid}-${filename}`;

      // Dedup über messageId + filename in notes
      if (messageId) {
        const { data: dup } = await admin
          .from("orders")
          .select("id")
          .eq("source", "email_intake")
          .ilike("notes", `%${messageId}%`)
          .limit(1);
        if (dup && dup.length > 0) continue;
      }

      // 1) Upload
      const { error: upErr } = await admin.storage
        .from("order-documents")
        .upload(storagePath, bytes, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(`storage upload: ${upErr.message}`);

      // 2) AI extraction
      const ai = await extractWithAI(b64, filename);

      const kindAllowed = ["new", "change", "cancellation", "other"];
      const order_kind = kindAllowed.includes(String(ai?.order_kind)) ? ai.order_kind : "new";

      const noteHeader = [
        `[KI-Import aus E-Mail]`,
        `Von: ${fromEmail}`,
        `Betreff: ${subject}`,
        messageId ? `MessageID: ${messageId}` : null,
        ai?.reasoning ? `KI-Begründung: ${ai.reasoning}` : null,
      ].filter(Boolean).join("\n");

      // 3) Insert order (draft)
      const insertPayload: any = {
        status: "draft",
        source: "email_intake",
        order_kind,
        customer_name: clamp(ai?.customer_name),
        customer_email: clamp(ai?.customer_email) || (fromEmail !== "unknown" ? fromEmail : null),
        customer_no: clamp(ai?.customer_no),
        external_order_no: clamp(ai?.external_order_no),
        order_date: safeDate(ai?.order_date),
        delivery_date: safeDate(ai?.delivery_date),
        payment_terms: clamp(ai?.payment_terms),
        currency: clamp(ai?.currency, "EUR") || "EUR",
        subtotal_amount: safeNum(ai?.subtotal_amount),
        tax_amount: safeNum(ai?.tax_amount),
        total_amount: safeNum(ai?.total_amount),
        tags: Array.isArray(ai?.tags) ? ai.tags.slice(0, 12).map((t: any) => String(t)) : [],
        notes: noteHeader,
      };

      const { data: ord, error: ordErr } = await admin
        .from("orders")
        .insert(insertPayload)
        .select("id, order_no")
        .single();
      if (ordErr) {
        await admin.storage.from("order-documents").remove([storagePath]);
        throw new Error(`order insert: ${ordErr.message}`);
      }

      // 4) Items
      const items = Array.isArray(ai?.items) ? ai.items : [];
      if (items.length > 0) {
        const itemRows = items.slice(0, 200).map((it: any, idx: number) => ({
          order_id: ord.id,
          position: safeNum(it?.position) ?? idx + 1,
          sku: clamp(it?.sku),
          description: String(it?.description || "(ohne Bezeichnung)").slice(0, 1000),
          quantity: safeNum(it?.quantity) ?? 1,
          unit: clamp(it?.unit),
          unit_price: safeNum(it?.unit_price),
          line_total: safeNum(it?.line_total),
          tax_rate: safeNum(it?.tax_rate),
        }));
        const { error: itErr } = await admin.from("order_items").insert(itemRows);
        if (itErr) console.error("items insert failed", itErr);
      }

      // 5) Link document
      const { error: docErr } = await admin.from("order_documents").insert({
        order_id: ord.id,
        storage_path: storagePath,
        file_name: filename,
        file_size: fileSize,
        mime_type: "application/pdf",
        doc_kind: "order",
        is_current: true,
      });
      if (docErr) console.error("doc link failed", docErr);

      created.push({ order_id: ord.id, order_no: ord.order_no, file: filename });
    } catch (e) {
      console.error("intake attachment failed", e);
      errors.push({ file: att?.Name, error: String(e) });
    }
  }

  return new Response(JSON.stringify({ status: "ok", created, errors }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

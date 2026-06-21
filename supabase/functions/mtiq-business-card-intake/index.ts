// MTIQ Business Card Intake
// Accepts a business card image (or PDF), extracts contact fields via Gemini
// vision and searches existing companies/contacts for likely duplicates.
// Does NOT write to the database — the user confirms via mtiq-business-card-commit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SYSTEM_PROMPT = `Du bist MTIQ und liest VISITENKARTEN. Es können MEHRERE Karten in einem Bild oder PDF enthalten sein (Vorder-/Rückseite separat, Sammelseite, mehrseitiges PDF).
Antworte AUSSCHLIESSLICH mit validem JSON in genau diesem Schema:
{
  "cards": [
    {
      "first_name": "Vorname oder null",
      "last_name": "Nachname oder null",
      "position": "Titel/Position oder null",
      "company_name": "Firma oder null",
      "email": "primäre E-Mail oder null",
      "phone": "Festnetz / Zentrale oder null",
      "mobile": "Mobilnummer oder null",
      "website": "URL oder null",
      "street": "Straße + Nr oder null",
      "zip": "PLZ oder null",
      "city": "Stadt oder null",
      "country": "Land oder null",
      "vat_id": "USt-ID oder null",
      "notes": "weitere relevante Infos (Slogan, weitere Telefone, …) oder null",
      "confidence": "low|medium|high"
    }
  ]
}
Regeln:
- Eine Karte = eine Person. Mehrere Personen ⇒ mehrere Einträge in "cards".
- Vorder- und Rückseite derselben Karte ZUSAMMENFÜHREN (ein Eintrag).
- Telefonnummern im Original-Format belassen (mit Ländervorwahl wenn vorhanden).
- Niemals Felder erfinden — was nicht lesbar ist → null.
- Wenn keine Visitenkarte erkennbar: "cards": [].`;

function bufferToBase64(buf: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("@")) return v.split("@").pop() || null;
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    return u.hostname.replace(/^www\./, "");
  } catch { return null; }
}

function tokensOf(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/\b(gmbh|ag|kg|ohg|ug|co\.?|kg|inc|ltd|llc|sa|s\.a\.|bv|gbr|e\.k\.|& ?co)\b/g, " ")
    .split(/[\s,.&\-]+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "file required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Datei zu groß (max. 20 MB)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mime = file.type || "image/jpeg";
    const buf = new Uint8Array(await file.arrayBuffer());
    const b64 = bufferToBase64(buf);

    const contentBlocks: any[] = [
      { type: "text", text: "Lies diese Visitenkarte und gib die Felder als JSON zurück." },
    ];
    if (mime.startsWith("image/")) {
      contentBlocks.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
    } else {
      contentBlocks.push({
        type: "file",
        file: { filename: file.name || "card.pdf", file_data: `data:${mime};base64,${b64}` },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: contentBlocks },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({
        error: aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht.",
      }), { status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const aiJson = await aiResp.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* keep empty */ } }
    }

    const extracted = {
      first_name: parsed?.first_name ?? null,
      last_name: parsed?.last_name ?? null,
      position: parsed?.position ?? null,
      company_name: parsed?.company_name ?? null,
      email: parsed?.email ?? null,
      phone: parsed?.phone ?? null,
      mobile: parsed?.mobile ?? null,
      website: parsed?.website ?? null,
      street: parsed?.street ?? null,
      zip: parsed?.zip ?? null,
      city: parsed?.city ?? null,
      country: parsed?.country ?? null,
      vat_id: parsed?.vat_id ?? null,
      notes: parsed?.notes ?? null,
      confidence: ["low", "medium", "high"].includes(parsed?.confidence) ? parsed.confidence : "medium",
    };

    // Duplicate search
    const admin = createClient(supabaseUrl, serviceKey);
    const emailDomain = domainOf(extracted.email);
    const webDomain = domainOf(extracted.website);
    const domain = emailDomain || webDomain;
    const tokens = tokensOf(extracted.company_name);

    const candidatesMap = new Map<string, { company: any; score: number; reasons: string[] }>();
    const bump = (c: any, score: number, reason: string) => {
      const cur = candidatesMap.get(c.id);
      if (cur) { cur.score += score; cur.reasons.push(reason); }
      else candidatesMap.set(c.id, { company: c, score, reasons: [reason] });
    };

    if (extracted.email) {
      const { data } = await admin.from("companies").select("*").ilike("email", extracted.email).limit(5);
      (data || []).forEach(c => bump(c, 10, `gleiche E-Mail (${extracted.email})`));
    }
    if (extracted.vat_id) {
      const { data } = await admin.from("companies").select("*").ilike("vat_id", extracted.vat_id).limit(5);
      (data || []).forEach(c => bump(c, 10, `gleiche USt-ID`));
    }
    if (domain) {
      const { data } = await admin.from("companies").select("*").ilike("website", `%${domain}%`).limit(10);
      (data || []).forEach(c => bump(c, 6, `Domain ${domain}`));
      const { data: data2 } = await admin.from("companies").select("*").ilike("email", `%@${domain}`).limit(10);
      (data2 || []).forEach(c => bump(c, 6, `E-Mail-Domain ${domain}`));
    }
    if (tokens.length) {
      // OR over tokens via .or() — escape commas
      const orExpr = tokens.map(t => `name.ilike.%${t}%`).join(",");
      const { data } = await admin.from("companies").select("*").or(orExpr).limit(15);
      (data || []).forEach(c => {
        const lower = (c.name || "").toLowerCase();
        const hits = tokens.filter(t => lower.includes(t)).length;
        if (hits > 0) bump(c, hits * 3, `Firmenname-Treffer: ${tokens.filter(t => lower.includes(t)).join(", ")}`);
      });
    }

    const candidates = Array.from(candidatesMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => ({
        company_id: c.company.id,
        name: c.company.name,
        type: c.company.type,
        partner_role: c.company.partner_role,
        customer_no: c.company.customer_no,
        email: c.company.email,
        website: c.company.website,
        city: c.company.billing_city,
        score: c.score,
        reasons: c.reasons,
      }));

    let contact_match: any = null;
    if (extracted.email) {
      const { data: cm } = await admin
        .from("contacts").select("*, company:companies(id,name,customer_no)")
        .ilike("email", extracted.email).limit(1).maybeSingle();
      if (cm) contact_match = cm;
    }

    return new Response(JSON.stringify({ extracted, candidates, contact_match }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-business-card-intake error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

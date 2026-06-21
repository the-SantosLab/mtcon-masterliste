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
    // Accept either a single "file" or multiple "files" / "file" entries.
    const filesRaw = [
      ...form.getAll("files"),
      ...form.getAll("file"),
    ].filter((f): f is File => f instanceof File);
    const files: File[] = [];
    const seen = new Set<string>();
    for (const f of filesRaw) {
      const key = `${f.name}::${f.size}::${f.type}`;
      if (!seen.has(key)) { seen.add(key); files.push(f); }
    }
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: "file required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (files.length > 10) {
      return new Response(JSON.stringify({ error: "Maximal 10 Dateien pro Upload." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    for (const f of files) {
      if (f.size > 20 * 1024 * 1024) {
        return new Response(JSON.stringify({ error: `Datei zu groß (max. 20 MB): ${f.name}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    async function extractCardsFromFile(file: File): Promise<any[]> {
      const mime = file.type || "image/jpeg";
      const buf = new Uint8Array(await file.arrayBuffer());
      const b64 = bufferToBase64(buf);

      const contentBlocks: any[] = [
        { type: "text", text: "Lies alle Visitenkarten in dieser Datei und gib sie als JSON-Array (\"cards\") zurück." },
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
        throw new Error(aiResp.status === 429 ? "Zu viele Anfragen." : "AI-Guthaben aufgebraucht.");
      }
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("AI gateway error", aiResp.status, t);
        throw new Error("AI gateway error");
      }
      const aiJson = await aiResp.json();
      const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
      let parsed: any = {};
      try { parsed = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch {
        const m = String(raw).match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* keep empty */ } }
      }
      const arr = Array.isArray(parsed?.cards) ? parsed.cards
        : Array.isArray(parsed) ? parsed
        : parsed && typeof parsed === "object" && (parsed.first_name !== undefined || parsed.company_name !== undefined) ? [parsed]
        : [];
      return arr;
    }

    function normalize(p: any) {
      return {
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        position: p?.position ?? null,
        company_name: p?.company_name ?? null,
        email: p?.email ?? null,
        phone: p?.phone ?? null,
        mobile: p?.mobile ?? null,
        website: p?.website ?? null,
        street: p?.street ?? null,
        zip: p?.zip ?? null,
        city: p?.city ?? null,
        country: p?.country ?? null,
        vat_id: p?.vat_id ?? null,
        notes: p?.notes ?? null,
        confidence: ["low", "medium", "high"].includes(p?.confidence) ? p.confidence : "medium",
      };
    }

    async function lookupDuplicates(extracted: ReturnType<typeof normalize>) {
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
      return { candidates, contact_match };
    }

    // 1) Extract cards from every uploaded file (in parallel)
    const perFile = await Promise.all(files.map(async (f) => {
      try { return { name: f.name, cards: await extractCardsFromFile(f) }; }
      catch (e) { console.error("extract failed", f.name, e); return { name: f.name, cards: [], error: (e as Error).message }; }
    }));

    // 2) Flatten + normalize + dedupe (same email across pages = one card)
    const flat: ReturnType<typeof normalize>[] = [];
    const dedupeKey = new Set<string>();
    for (const pf of perFile) {
      for (const card of pf.cards) {
        const n = normalize(card);
        const key = (n.email || `${n.first_name ?? ""}|${n.last_name ?? ""}|${n.company_name ?? ""}`).toLowerCase().trim();
        if (key && dedupeKey.has(key)) continue;
        if (key) dedupeKey.add(key);
        flat.push(n);
      }
    }

    // 3) Duplicate lookup per card (parallel)
    const results = await Promise.all(flat.map(async (extracted, idx) => {
      const dup = await lookupDuplicates(extracted);
      return { index: idx, extracted, ...dup };
    }));

    const first = results[0];
    return new Response(JSON.stringify({
      results,
      count: results.length,
      // back-compat with previous single-card response shape
      extracted: first?.extracted ?? null,
      candidates: first?.candidates ?? [],
      contact_match: first?.contact_match ?? null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("mtiq-business-card-intake error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

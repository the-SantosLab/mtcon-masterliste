// MTIQ Business Card Commit
// Creates a company + contact (or just a contact attached to an existing company)
// from data confirmed by the user in the Visitenkarten-Scan UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type Choice = "kunde" | "distributor" | "lieferant" | "sonstiges" | "attach";

interface Extracted {
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null;
  vat_id?: string | null;
  notes?: string | null;
}

function mapChoice(choice: Choice): { type: string; partner_role: string } | null {
  switch (choice) {
    case "kunde":      return { type: "kunde",       partner_role: "customer" };
    case "distributor":return { type: "distributor", partner_role: "both" };
    case "lieferant":  return { type: "kunde",       partner_role: "supplier" };
    case "sonstiges":  return { type: "mitbewerber", partner_role: "lead" };
    default: return null;
  }
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
    const userId = userRes.user.id;

    const body = await req.json();
    const extracted: Extracted = body?.extracted ?? {};
    const choice: Choice = body?.choice;
    const companyId: string | null = body?.company_id ?? null;

    if (!choice) {
      return new Response(JSON.stringify({ error: "choice required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (choice === "attach" && !companyId) {
      return new Response(JSON.stringify({ error: "company_id required for attach" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    let resolvedCompanyId = companyId;
    let customerNo: string | null = null;

    if (choice !== "attach") {
      const mapping = mapChoice(choice);
      if (!mapping) {
        return new Response(JSON.stringify({ error: "invalid choice" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const name = (extracted.company_name || "").trim();
      if (!name) {
        return new Response(JSON.stringify({ error: "Firmenname fehlt – kann nicht angelegt werden." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Allocate a fresh customer_no via RPC
      const { data: noData, error: noErr } = await admin.rpc("gen_next_customer_no");
      if (noErr) throw noErr;
      customerNo = String(noData);

      const phone = extracted.mobile || extracted.phone || null;
      const { data: comp, error: compErr } = await admin.from("companies").insert({
        name,
        type: mapping.type,
        partner_role: mapping.partner_role,
        customer_no: customerNo,
        email: extracted.email || null,
        phone,
        website: extracted.website || null,
        vat_id: extracted.vat_id || null,
        billing_street: extracted.street || null,
        billing_zip: extracted.zip || null,
        billing_city: extracted.city || null,
        billing_country: extracted.country || null,
        notes: extracted.notes || null,
        owner_id: userId,
        created_by: userId,
        last_changed_by: userId,
        is_active: true,
        shipping_same_as_billing: true,
      }).select("id, customer_no").single();
      if (compErr) throw compErr;
      resolvedCompanyId = comp.id;
      customerNo = comp.customer_no;
    } else {
      // Look up customer_no for response
      const { data: comp } = await admin.from("companies")
        .select("customer_no").eq("id", resolvedCompanyId!).maybeSingle();
      customerNo = comp?.customer_no ?? null;
    }

    // Create contact (only if we have at least a last name OR email)
    let contactId: string | null = null;
    const lastName = (extracted.last_name || "").trim();
    const firstName = (extracted.first_name || "").trim();
    if (lastName || firstName || extracted.email) {
      const { data: contact, error: contErr } = await admin.from("contacts").insert({
        company_id: resolvedCompanyId,
        first_name: firstName || "—",
        last_name: lastName || (extracted.email ? extracted.email.split("@")[0] : "—"),
        email: extracted.email || null,
        phone: extracted.mobile || extracted.phone || null,
        position: extracted.position || null,
      }).select("id").single();
      if (contErr) throw contErr;
      contactId = contact.id;
    }

    return new Response(JSON.stringify({
      company_id: resolvedCompanyId,
      contact_id: contactId,
      customer_no: customerNo,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("mtiq-business-card-commit error", e);
    return new Response(JSON.stringify({ error: (e as Error).message ?? "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

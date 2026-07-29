// XRechnung 3.0 (UBL 2.1) XML für eine Rechnung erzeugen.
// Rechtsgrundlage: E-Rechnungspflicht B2B DE ab 2025.
// Aufruf: POST { invoice_id } -> { xml, filename }
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const n2 = (v: unknown) => Number(v ?? 0).toFixed(2);
const n4 = (v: unknown) => Number(v ?? 0).toFixed(4);

const SELLER = {
  name: "MTCONNECTIVITY power2pcb GmbH",
  street: "Röntgenstraße 27",
  city: "Ludwigsburg",
  postal: "71642",
  country: "DE",
  vatId: "DE355789843",
  regNo: "HRB 780123",
  email: "info@mtcon.eu",
  phone: "+49 7141 4879370",
  iban: "DE42600501017482010783",
  bic: "SOLADEST600",
  bank: "Baden-Württembergische Bank",
};

const TAX_CATEGORY: Record<string, { id: string; exemptionReason?: string }> = {
  standard: { id: "S" },
  reverse_charge: { id: "AE", exemptionReason: "Steuerschuldnerschaft des Leistungsempfängers / Reverse charge" },
  tax_free_eu: { id: "K", exemptionReason: "Innergemeinschaftliche Lieferung, steuerfrei nach § 4 Nr. 1b UStG" },
  tax_free_third_country: { id: "G", exemptionReason: "Ausfuhrlieferung, steuerfrei nach § 4 Nr. 1a UStG" },
  small_business: { id: "E", exemptionReason: "Kein Steuerausweis gem. § 19 UStG (Kleinunternehmer)" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { invoice_id } = await req.json();
    if (!invoice_id || typeof invoice_id !== "string") {
      return new Response(JSON.stringify({ error: "invoice_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: inv, error: invErr } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: invErr?.message ?? "Rechnung nicht gefunden" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice_id).order("position");

    const mode = (inv.tax_mode ?? "standard") as keyof typeof TAX_CATEGORY;
    const cat = TAX_CATEGORY[mode] ?? TAX_CATEGORY.standard;
    const currency = inv.currency ?? "EUR";
    const issueDate = (inv.invoice_date ?? inv.created_at ?? new Date().toISOString()).slice(0, 10);
    const dueDate = inv.due_date ?? issueDate;

    // Adress-Zeilen aus billing_address (Zeilen: Name / Straße / PLZ Ort / Land)
    const addrLines = String(inv.billing_address ?? "").split("\n").map(l => l.trim()).filter(Boolean);
    const [buyerStreet = "", buyerPostalCity = "", buyerCountryLine = ""] = addrLines.slice(1);
    const buyerPostal = (buyerPostalCity.match(/^(\d{4,5})/)?.[1]) ?? "";
    const buyerCity = buyerPostalCity.replace(/^\d{4,5}\s*/, "");
    const buyerCountry = (buyerCountryLine.match(/[A-Z]{2}/)?.[0]) ?? "DE";

    // Positionen + USt-Aggregation
    const taxGroups = new Map<string, { rate: number; taxable: number; tax: number }>();
    const lines = (items ?? []).map((it: any, i: number) => {
      const rate = Number(it.tax_rate ?? 0);
      const lineNet = Number(it.line_total ?? 0);
      const lineTax = mode === "standard" ? lineNet * rate / 100 : 0;
      const key = String(rate);
      const grp = taxGroups.get(key) ?? { rate, taxable: 0, tax: 0 };
      grp.taxable += lineNet;
      grp.tax += lineTax;
      taxGroups.set(key, grp);
      return `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="H87">${n4(it.quantity)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${n2(lineNet)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${esc(it.description ?? it.art_nr ?? "Position")}</cbc:Name>
        ${it.art_nr ? `<cac:SellersItemIdentification><cbc:ID>${esc(it.art_nr)}</cbc:ID></cac:SellersItemIdentification>` : ""}
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${cat.id}</cbc:ID>
          <cbc:Percent>${n2(mode === "standard" ? rate : 0)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${n4(it.unit_price ?? 0)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    }).join("");

    const subtotal = Number(inv.subtotal_amount ?? 0);
    const taxAmount = mode === "standard" ? Number(inv.tax_amount ?? 0) : 0;
    const total = Number(inv.total_amount ?? subtotal + taxAmount);

    const taxSubtotals = Array.from(taxGroups.values()).map(g => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${n2(g.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${n2(mode === "standard" ? g.tax : 0)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${cat.id}</cbc:ID>
        <cbc:Percent>${n2(mode === "standard" ? g.rate : 0)}</cbc:Percent>
        ${cat.exemptionReason ? `<cbc:TaxExemptionReason>${esc(cat.exemptionReason)}</cbc:TaxExemptionReason>` : ""}
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join("");

    const paymentTermsNote = inv.skonto_percent && inv.skonto_days
      ? `#SKONTO#TAGE=${inv.skonto_days}#PROZENT=${n2(inv.skonto_percent)}#`
      : `Zahlbar bis ${dueDate}`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(inv.invoice_no)}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${inv.doc_kind === "credit_note" ? "381" : inv.doc_kind === "storno" ? "384" : "380"}</cbc:InvoiceTypeCode>
  ${inv.notes ? `<cbc:Note>${esc(inv.notes)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  ${inv.customer_no ? `<cbc:BuyerReference>${esc(inv.customer_no)}</cbc:BuyerReference>` : `<cbc:BuyerReference>${esc(inv.invoice_no)}</cbc:BuyerReference>`}
  ${inv.storno_of_invoice_id || inv.credit_note_of_invoice_id ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(inv.storno_of_invoice_id ?? inv.credit_note_of_invoice_id)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ""}
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PostalAddress>
      <cbc:StreetName>${esc(SELLER.street)}</cbc:StreetName>
      <cbc:CityName>${esc(SELLER.city)}</cbc:CityName>
      <cbc:PostalZone>${esc(SELLER.postal)}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>${SELLER.country}</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>${SELLER.vatId}</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${esc(SELLER.name)}</cbc:RegistrationName>
      <cbc:CompanyID>${SELLER.regNo}</cbc:CompanyID>
    </cac:PartyLegalEntity>
    <cac:Contact>
      <cbc:Telephone>${SELLER.phone}</cbc:Telephone>
      <cbc:ElectronicMail>${SELLER.email}</cbc:ElectronicMail>
    </cac:Contact>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PostalAddress>
      <cbc:StreetName>${esc(buyerStreet)}</cbc:StreetName>
      <cbc:CityName>${esc(buyerCity)}</cbc:CityName>
      <cbc:PostalZone>${esc(buyerPostal)}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>${esc(buyerCountry)}</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${esc(inv.customer_name ?? "Unbekannt")}</cbc:RegistrationName>
    </cac:PartyLegalEntity>
    ${inv.customer_email ? `<cac:Contact><cbc:ElectronicMail>${esc(inv.customer_email)}</cbc:ElectronicMail></cac:Contact>` : ""}
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${esc(inv.invoice_no)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${SELLER.iban}</cbc:ID>
      <cbc:Name>${esc(SELLER.bank)}</cbc:Name>
      <cac:FinancialInstitutionBranch><cbc:ID>${SELLER.bic}</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>${esc(paymentTermsNote)}</cbc:Note></cac:PaymentTerms>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${n2(taxAmount)}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${n2(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${n2(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${n2(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${n2(total - Number(inv.paid_amount ?? 0))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;

    return new Response(JSON.stringify({ xml, filename: `xrechnung-${inv.invoice_no}.xml` }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-xrechnung error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

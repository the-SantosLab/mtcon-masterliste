// Lädt einen Beleg + zugehörige Positionen + Firmen-/Ansprechpartner-Daten
// und ruft den passenden Generator auf. Öffnet das PDF in einem neuen Tab.
import { supabase } from '@/integrations/supabase/client';
import { fmt } from './renderer';
import type { Party, ContactInfo, LineItem } from './generators';
import type { PdfDocumentOutput } from '@/lib/pdfJobs';

export type ErpDocType = 'angebot' | 'ab' | 'bestellung' | 'lieferschein' | 'ruecklieferschein' | 'rechnung';

async function loadCompanyParty(companyId: string | null | undefined, fallbackName?: string | null): Promise<Party & { customerNo?: string | null }> {
  if (!companyId) return { name: fallbackName || '', lines: [] };
  const { data } = await supabase.from('companies' as any).select('name, address, billing_street, billing_zip, billing_city, billing_country, country, customer_no').eq('id', companyId).maybeSingle() as any;
  if (!data) return { name: fallbackName || '', lines: [] };
  const lines: string[] = [];
  if (data.billing_street || data.billing_zip || data.billing_city) {
    if (data.billing_street) lines.push(data.billing_street);
    const cityLine = [data.billing_zip, data.billing_city].filter(Boolean).join(' ');
    if (cityLine) lines.push(cityLine);
  } else if (data.address) {
    lines.push(...String(data.address).split('\n').map((line) => line.trim()).filter(Boolean));
  }
  if (data.billing_country || data.country) lines.push(data.billing_country || data.country);
  return { name: data.name || fallbackName || '', lines, customerNo: data.customer_no };
}
async function loadContact(contactId: string | null | undefined): Promise<ContactInfo> {
  if (!contactId) return {};
  const { data } = await supabase.from('contacts' as any).select('first_name, last_name, email, phone').eq('id', contactId).maybeSingle() as any;
  if (!data) return {};
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || null;
  return { contactName: name, email: data.email, phone: data.phone };
}
async function loadSupplier(supplierId: string): Promise<{ party: Party; contact: ContactInfo }> {
  const { data } = await supabase.from('suppliers' as any).select('*').eq('id', supplierId).maybeSingle() as any;
  if (!data) return { party: { name: '', lines: [] }, contact: {} };
  const lines: string[] = [];
  if (data.address) lines.push(...String(data.address).split('\n'));
  return {
    party: { name: data.name || '', lines },
    contact: { contactName: data.contact_name, email: data.email, phone: data.phone },
  };
}

export async function loadAngebotData(id: string) {
  const { data: o } = await supabase.from('offers' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('offer_items' as any).select('*').eq('offer_id', id).order('sort_order') as any;
  const { data: deal } = await supabase.from('deals' as any).select('title').eq('id', o.deal_id).maybeSingle() as any;
  const party = await loadCompanyParty(o.company_id);
  const contact = await loadContact(o.primary_contact_id);
  contact.customerNo = party.customerNo;
  contact.subject = deal?.title || undefined;
  const lineItems: LineItem[] = (items || []).map((it: any, idx: number) => {
    const val = Number(it.quantity) * Number(it.unit_price) * (1 - Number(it.discount_pct || 0) / 100);
    return {
      pos: (idx + 1) * 10, artNr: it.art_nr, description: it.description || '',
      quantity: it.quantity, unit: 'ST', price: it.unit_price, positionValue: val,
    };
  });
  return {
    offerNo: `${o.offer_no}${o.version && o.version > 1 ? '-' + String(o.version).padStart(2, '0') : ''}`,
    date: fmt.date(o.created_at), validUntil: o.valid_until,
    party, contact, items: lineItems, currency: 'EUR',
    paymentTerms: o.payment_terms || '14 Tage 2%, 30 Tage netto',
    deliveryTerms: 'ab Werk', notes: o.notes,
    scope: { companyId: o.company_id, dealId: o.deal_id },
  };
}

export async function loadABData(id: string) {
  const { data: o } = await supabase.from('orders' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('order_items' as any).select('*').eq('order_id', id).order('position') as any;
  const party = await loadCompanyParty(o.company_id, o.customer_name);
  const lineItems: LineItem[] = (items || []).map((it: any) => ({
    pos: it.position, artNr: it.art_nr || it.sku, description: it.description,
    quantity: it.quantity, unit: it.unit || 'ST', price: it.unit_price, positionValue: it.line_total,
  }));
  const subtotal = Number(o.subtotal_amount || 0);
  const tax = Number(o.tax_amount || subtotal * 0.19);
  const total = Number(o.total_amount || subtotal + tax);
  return {
    abNo: o.order_no, date: fmt.date(o.order_date || o.created_at),
    deliveryDate: o.delivery_date,
    party, contact: { customerNo: o.customer_no, contactName: 'Auftragsbestätigungen', email: o.customer_email, subject: o.external_order_no },
    items: lineItems, currency: o.currency || 'EUR',
    subtotal, tax, total,
    paymentTerms: o.payment_terms || '14 Tage 2%, 30 Tage netto',
    deliveryTerms: 'ab Werk',
    isFrame: o.order_kind === 'frame' || o.order_kind === 'rahmen',
    scope: { companyId: o.company_id },
  };
}

export async function loadBestellungData(id: string) {
  const { data: p } = await supabase.from('purchase_orders' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('purchase_order_items' as any).select('*').eq('po_id', id).order('position') as any;
  const sup = await loadSupplier(p.supplier_id);
  const lineItems: LineItem[] = (items || []).map((it: any) => ({
    pos: it.position, artNr: it.art_nr, description: it.description || '',
    quantity: it.qty_ordered, unit: 'ST', price: it.unit_price,
    positionValue: it.unit_price != null ? Number(it.qty_ordered) * Number(it.unit_price) : null,
  }));
  return {
    poNo: p.po_no || p.id.slice(0, 8), date: fmt.date(p.ordered_at || p.created_at),
    expected: p.expected_at, party: sup.party, contact: sup.contact,
    items: lineItems, currency: 'EUR', notes: p.notes,
  };
}

export async function loadLieferscheinData(id: string, isReturn = false) {
  const { data: d } = await supabase.from('deliveries' as any).select('*, orders(order_no, customer_name, company_id, customer_no)').eq('id', id).single() as any;
  const { data: items } = await supabase.from('delivery_items' as any).select('*').eq('delivery_id', id).order('position') as any;
  const companyId = d.company_id || d.orders?.company_id;
  const party = await loadCompanyParty(companyId, d.orders?.customer_name);
  if (d.ship_to && !party.lines.length) {
    party.lines = String(d.ship_to).split('\n').slice(1);
    if (!party.name && String(d.ship_to).split('\n')[0]) party.name = String(d.ship_to).split('\n')[0];
  }
  const lineItems = (items || []).map((it: any) => ({
    pos: it.position, artNr: it.art_nr, description: it.description,
    quantity: it.quantity, unit: it.unit || 'ST',
    extraLines: [it.lot_no && `Chargen-Nr: ${it.lot_no}`, it.serial_no && `SN: ${it.serial_no}`].filter(Boolean) as string[],
    orderNo: d.orders?.order_no,
  }));
  return {
    deliveryNo: d.delivery_no, date: fmt.date(d.delivery_date || d.created_at),
    orderNo: d.orders?.order_no, party,
    contact: { customerNo: d.orders?.customer_no },
    items: lineItems, deliveryTerms: 'ab Werk', notes: d.notes,
    isReturn,
    scope: { companyId },
  };
}

export async function loadRechnungData(id: string) {
  const { data: inv } = await supabase.from('invoices' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('invoice_items' as any).select('*').eq('invoice_id', id).order('position') as any;
  const party = await loadCompanyParty(inv.company_id, inv.customer_name);
  if (inv.billing_address && !party.lines.length) {
    const addrLines = String(inv.billing_address).split('\n');
    party.lines = addrLines;
  }
  const lang = inv.currency === 'USD' ? 'en' : 'de';
  const lineItems: LineItem[] = (items || []).map((it: any) => ({
    pos: it.position, artNr: it.art_nr, description: it.description,
    quantity: it.quantity, unit: it.unit || 'ST', price: it.unit_price, positionValue: it.line_total,
  }));
  return {
    invoiceNo: inv.invoice_no, date: fmt.date(inv.invoice_date || inv.created_at, lang),
    dueDate: inv.due_date, party,
    contact: { customerNo: inv.customer_no, email: inv.customer_email },
    items: lineItems, currency: inv.currency || 'EUR',
    subtotal: Number(inv.subtotal_amount || 0),
    tax: Number(inv.tax_amount || 0),
    total: Number(inv.total_amount || 0),
    paymentTerms: inv.payment_terms || (inv.currency === 'USD' ? '45 days net' : '14 Tage 2%, 30 Tage netto'),
    language: lang as 'de' | 'en', factoringNote: true,
    taxMode: inv.tax_mode || 'standard',
    skontoPercent: inv.skonto_percent, skontoDays: inv.skonto_days,
    docKind: inv.doc_kind || 'invoice',
    scope: { companyId: inv.company_id },
  };
}

export async function buildErpPdf(
  type: ErpDocType,
  id: string,
  report?: (phase: string, progress: number) => void,
): Promise<PdfDocumentOutput> {
  report?.('Daten laden', 0.15);
  void logErpPdfPrint(type, id);
  if (type === 'angebot') {
    const { renderOfferOverlay } = await import('./offerOverlay');
    const data = await loadAngebotData(id) as any;
    report?.('Originalvorlage anwenden', 0.65);
    const bytes = await renderOfferOverlay(data, { scope: data.scope });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const download = (fileName: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
    return {
      output: (outputType: 'blob') => {
        if (outputType !== 'blob') throw new Error('Nicht unterstütztes PDF-Ausgabeformat');
        return blob;
      },
      save: download,
      internal: {
        getDocumentProperties: () => ({ title: `Angebot-${data.offerNo}` }),
      },
    };
  }
  if (type === 'ab') {
    const { renderOrderOverlay } = await import('./orderOverlay');
    const data = await loadABData(id) as any;
    report?.('Originalvorlage anwenden', 0.65);
    const bytes = await renderOrderOverlay(data, { scope: data.scope });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const download = (fileName: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
    return {
      output: (outputType: 'blob') => {
        if (outputType !== 'blob') throw new Error('Nicht unterstütztes PDF-Ausgabeformat');
        return blob;
      },
      save: download,
      internal: {
        getDocumentProperties: () => ({ title: `Auftragsbestaetigung-${data.abNo}` }),
      },
    };
  }
  if (type === 'rechnung') {
    const { renderInvoiceOverlay } = await import('./invoiceOverlay');
    const data = await loadRechnungData(id) as any;
    report?.('Originalvorlage anwenden', 0.65);
    const bytes = await renderInvoiceOverlay(data, { scope: data.scope });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const download = (fileName: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };
    return {
      output: (outputType: 'blob') => {
        if (outputType !== 'blob') throw new Error('Nicht unterstütztes PDF-Ausgabeformat');
        return blob;
      },
      save: download,
      internal: {
        getDocumentProperties: () => ({ title: `Rechnung-${data.invoiceNo}` }),
      },
    };
  }
  if (type === 'bestellung') {
    const { renderPurchaseOverlay } = await import('./purchaseOverlay');
    const data = await loadBestellungData(id) as any;
    report?.('Originalvorlage anwenden', 0.65);
    return pdfOutputAdapter(await renderPurchaseOverlay(data), `Bestellung-${data.poNo}`);
  }
  if (type === 'lieferschein' || type === 'ruecklieferschein') {
    const { renderDeliveryOverlay } = await import('./deliveryOverlay');
    const data = await loadLieferscheinData(id, type === 'ruecklieferschein') as any;
    report?.('Originalvorlage anwenden', 0.65);
    const title = type === 'ruecklieferschein' ? 'Ruecklieferschein' : 'Lieferschein';
    return pdfOutputAdapter(await renderDeliveryOverlay(data, { scope: data.scope }), `${title}-${data.deliveryNo}`);
  }
  throw new Error('Unbekannter Belegtyp');
}

/** Protokolliert eine PDF-Erzeugung im verknüpften Vorgang (kein Statuswechsel). */
export async function logErpPdfPrint(type: ErpDocType, id: string): Promise<void> {
  try {
    const labels: Record<ErpDocType, string> = {
      angebot: 'Angebot', ab: 'Auftragsbestätigung', bestellung: 'Bestellung',
      lieferschein: 'Lieferschein', ruecklieferschein: 'Rücklieferschein', rechnung: 'Rechnung',
    };
    let caseId: string | null = null;
    if (type === 'angebot') {
      const { data } = await supabase.from('offers' as any).select('case_id').eq('id', id).maybeSingle() as any;
      caseId = data?.case_id ?? null;
    } else if (type === 'ab') {
      const { data } = await supabase.from('orders' as any).select('case_id').eq('id', id).maybeSingle() as any;
      caseId = data?.case_id ?? null;
    }
    if (!caseId) return;
    await (supabase as any).rpc('log_case_pdf_print', { _case_id: caseId, _doc_label: labels[type] });
  } catch {
    /* Protokollierung darf die PDF-Ausgabe nie blockieren */
  }
}

export async function openErpPdf(type: ErpDocType, id: string): Promise<void> {
  void logErpPdfPrint(type, id);
  if (type === 'rechnung') {
    const { openInvoiceOverlayPdf } = await import('./invoiceOverlay');
    const invData = await loadRechnungData(id) as any;
    await openInvoiceOverlayPdf(invData, { scope: invData.scope });
    return;
  }
  if (type === 'lieferschein' || type === 'ruecklieferschein') {
    const { openDeliveryOverlayPdf } = await import('./deliveryOverlay');
    const delData = await loadLieferscheinData(id, type === 'ruecklieferschein') as any;
    await openDeliveryOverlayPdf(delData, { scope: delData.scope });
    return;
  }
  if (type === 'angebot') {
    const { openOfferOverlayPdf } = await import('./offerOverlay');
    const offData = await loadAngebotData(id) as any;
    await openOfferOverlayPdf(offData, { scope: offData.scope });
    return;
  }
  if (type === 'ab') {
    const { openOrderOverlayPdf } = await import('./orderOverlay');
    const abData = await loadABData(id) as any;
    await openOrderOverlayPdf(abData, { scope: abData.scope });
    return;
  }
  if (type === 'bestellung') {
    const { openPurchaseOverlayPdf } = await import('./purchaseOverlay');
    await openPurchaseOverlayPdf(await loadBestellungData(id) as any);
    return;
  }
  throw new Error('Unbekannter Belegtyp');
}

function pdfOutputAdapter(bytes: Uint8Array, title: string): PdfDocumentOutput {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  return {
    output: (outputType: 'blob') => {
      if (outputType !== 'blob') throw new Error('Nicht unterstütztes PDF-Ausgabeformat');
      return blob;
    },
    save: (fileName: string) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    internal: { getDocumentProperties: () => ({ title }) },
  };
}




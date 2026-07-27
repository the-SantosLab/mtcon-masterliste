// Lädt einen Beleg + zugehörige Positionen + Firmen-/Ansprechpartner-Daten
// und ruft den passenden Generator auf. Öffnet das PDF in einem neuen Tab.
import { supabase } from '@/integrations/supabase/client';
import { fmt } from './renderer';
import {
  buildAngebotPdf, buildABPdf, buildBestellungPdf,
  buildLieferscheinPdf, buildRechnungPdf, Party, ContactInfo, LineItem,
} from './generators';

export type ErpDocType = 'angebot' | 'ab' | 'bestellung' | 'lieferschein' | 'ruecklieferschein' | 'rechnung';

async function loadCompanyParty(companyId: string | null | undefined, fallbackName?: string | null): Promise<Party> {
  if (!companyId) return { name: fallbackName || '', lines: [] };
  const { data } = await supabase.from('companies' as any).select('name, street, postal_code, city, country').eq('id', companyId).maybeSingle() as any;
  if (!data) return { name: fallbackName || '', lines: [] };
  const lines: string[] = [];
  if (data.street) lines.push(data.street);
  const cityLine = [data.postal_code, data.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (data.country) lines.push(data.country);
  return { name: data.name || fallbackName || '', lines };
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

async function loadAngebotData(id: string) {
  const { data: o } = await supabase.from('offers' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('offer_items' as any).select('*').eq('offer_id', id).order('sort_order') as any;
  const party = await loadCompanyParty(o.company_id);
  const contact = await loadContact(o.primary_contact_id);
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
  };
}

async function loadAngebot(id: string) {
  return buildAngebotPdf(await loadAngebotData(id) as any);
}

async function loadAB(id: string) {
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
  return buildABPdf({
    abNo: o.order_no, date: fmt.date(o.order_date || o.created_at),
    deliveryDate: o.delivery_date,
    party, contact: { customerNo: o.customer_no, contactName: 'Auftragsbestätigungen', email: o.customer_email, subject: o.external_order_no },
    items: lineItems, currency: o.currency || 'EUR',
    subtotal, tax, total,
    paymentTerms: o.payment_terms || '14 Tage 2%, 30 Tage netto',
    deliveryTerms: 'ab Werk',
    isFrame: o.order_kind === 'frame' || o.order_kind === 'rahmen',
  });
}

async function loadBestellung(id: string) {
  const { data: p } = await supabase.from('purchase_orders' as any).select('*').eq('id', id).single() as any;
  const { data: items } = await supabase.from('purchase_order_items' as any).select('*').eq('po_id', id).order('position') as any;
  const sup = await loadSupplier(p.supplier_id);
  const lineItems: LineItem[] = (items || []).map((it: any) => ({
    pos: it.position, artNr: it.art_nr, description: it.description || '',
    quantity: it.qty_ordered, unit: 'ST', price: it.unit_price,
    positionValue: it.unit_price != null ? Number(it.qty_ordered) * Number(it.unit_price) : null,
  }));
  return buildBestellungPdf({
    poNo: p.po_no || p.id.slice(0, 8), date: fmt.date(p.ordered_at || p.created_at),
    expected: p.expected_at, party: sup.party, contact: sup.contact,
    items: lineItems, currency: 'EUR', notes: p.notes,
  });
}

async function loadLieferscheinData(id: string, isReturn = false) {
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
  };
}

async function loadLieferschein(id: string, isReturn = false) {
  return buildLieferscheinPdf(await loadLieferscheinData(id, isReturn) as any);
}


async function loadRechnungData(id: string) {
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
  };
}

async function loadRechnung(id: string) {
  return buildRechnungPdf(await loadRechnungData(id));
}

export async function buildErpPdf(
  type: ErpDocType,
  id: string,
  report?: (phase: string, progress: number) => void,
) {
  report?.('Daten laden', 0.15);
  let doc;
  switch (type) {
    case 'angebot': doc = await loadAngebot(id); break;
    case 'ab': doc = await loadAB(id); break;
    case 'bestellung': doc = await loadBestellung(id); break;
    case 'lieferschein': doc = await loadLieferschein(id, false); break;
    case 'ruecklieferschein': doc = await loadLieferschein(id, true); break;
    case 'rechnung': doc = await loadRechnung(id); break;
  }
  report?.('Rendern', 0.8);
  return doc!;
}

export async function openErpPdf(type: ErpDocType, id: string): Promise<void> {
  if (type === 'rechnung') {
    // Rechnungen laufen über den Overlay-Renderer auf der Originalvorlage.
    const { openInvoiceOverlayPdf } = await import('./invoiceOverlay');
    await openInvoiceOverlayPdf(await loadRechnungData(id) as any);
    return;
  }
  if (type === 'lieferschein' || type === 'ruecklieferschein') {
    // Lieferscheine ebenfalls pixelgleich per Overlay auf die Originalvorlage.
    const { openDeliveryOverlayPdf } = await import('./deliveryOverlay');
    await openDeliveryOverlayPdf(await loadLieferscheinData(id, type === 'ruecklieferschein') as any);
    return;
  }

  const doc = await buildErpPdf(type, id);
  const url = doc.output('bloburl');
  window.open(url as any, '_blank');
}




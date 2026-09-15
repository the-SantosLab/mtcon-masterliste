// Beispieldaten je Belegtyp, um eine hinterlegte PDF-Vorlage direkt zu testen.
// Erzeugt immer ein PDF mit DEMO-Wasserzeichen, ohne Datenbankeintrag.
import type { TemplateDocType } from './templateSource';
import { openOfferOverlayPdf } from './offerOverlay';
import { openOrderOverlayPdf } from './orderOverlay';
import { openPurchaseOverlayPdf } from './purchaseOverlay';
import { openDeliveryOverlayPdf } from './deliveryOverlay';
import { openInvoiceOverlayPdf } from './invoiceOverlay';

const party = {
  name: 'Muster Kunde AG',
  lines: ['Product Solution Management', 'Herr Mustermann', 'Musterstrasse 70', '6301 Zug', 'SWITZERLAND'],
};

const contact = {
  customerNo: '11426',
  contactName: 'Frau Magnussen',
  phone: '+49 7940 989998-0',
  fax: '+49 7940 989998-9',
  email: 'Anja.Magnussen@mtcon.eu',
  subject: 'Vorlagen-Test',
};

const items = [
  {
    pos: 10,
    artNr: '02.3.0002.B',
    description: 'Power Socket M4, 9-er, rundum, RM 2,54 (3x) press-fit massiv',
    quantity: 500, unit: 'ST', price: 0.54, positionValue: 270,
  },
  {
    pos: 20,
    artNr: '02.1.0004.C',
    description: 'Power Socket M6, 10-er, vollflächig, RM 2,54 (3x) press-fit massiv',
    quantity: 1000, unit: 'ST', price: 0.75, positionValue: 750,
  },
];

const subtotal = 1020;
const tax = 193.8;
const total = 1213.8;
const today = new Date().toLocaleDateString('de-DE');

export async function openSampleTemplatePdf(docType: TemplateDocType): Promise<void> {
  switch (docType) {
    case 'angebot':
      return openOfferOverlayPdf({
        offerNo: 'MUSTER-001', date: today, validUntil: null,
        party, contact, items, currency: 'EUR',
        deliveryTerms: 'ab Werk', paymentTerms: '14 Tage 2%, 30 Tage netto',
      }, { demo: true });
    case 'ab':
      return openOrderOverlayPdf({
        abNo: 'MUSTER-001', date: today, deliveryDate: null,
        party, contact, items, currency: 'EUR',
        subtotal, tax, total, taxRate: 19,
        deliveryTerms: 'ab Werk', paymentTerms: '30 Tage netto',
      }, { demo: true });
    case 'bestellung':
      return openPurchaseOverlayPdf({
        poNo: 'MUSTER-001', date: today, expected: null,
        party: { name: 'Muster Lieferant GmbH', lines: ['Lieferstrasse 1', '74676 Niedernhall', 'DEUTSCHLAND'] },
        contact: { ...contact, customerNo: null, supplierNo: '70012' },
        items, currency: 'EUR',
      }, { demo: true });
    case 'lieferschein':
      return openDeliveryOverlayPdf({
        deliveryNo: 'MUSTER-001', date: today, orderNo: 'MUSTER-A-001',
        party, contact, items, deliveryTerms: 'ab Werk', packages: 2,
      }, { demo: true });
    case 'rechnung':
      return openInvoiceOverlayPdf({
        invoiceNo: 'MUSTER-001', date: today, dueDate: null,
        party, contact, items, currency: 'EUR',
        subtotal, tax, total, taxRate: 19,
        paymentTerms: '30 Tage netto',
      }, { demo: true });
  }
}

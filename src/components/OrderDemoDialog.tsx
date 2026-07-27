// Demo-Formular für Auftragsbestätigungen — erzeugt eine AB-PDF mit
// DEMO-Wasserzeichen zum Prüfen der Vorlage (kein DB-Eintrag).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, FileText } from 'lucide-react';
import { openOrderOverlayPdf } from '@/lib/erp-pdf/orderOverlay';
import type { ABData } from '@/lib/erp-pdf/generators';
import { toast } from 'sonner';

type DemoItem = { pos: string; artNr: string; description: string; quantity: string; unit: string; price: string };
const newItem = (): DemoItem => ({ pos: '', artNr: '', description: '', quantity: '', unit: 'ST', price: '' });

const SAMPLE = {
  abNo: '18133',
  date: new Date().toISOString().slice(0, 10),
  deliveryDate: '2026-07-22',
  recipientName: 'TE Connectivity Kissling Products GmbH',
  recipientLines: 'Auftragsbestätigungen\nWeidensteige 61\n75365 Calw',
  customerNo: '10196',
  contactName: 'Frau Gäckle',
  phone: '+49 7940 / 989998-6',
  fax: '+49 7940 / 989998-9',
  email: 'Ann-Christine.Gaeckle@mtcon.eu',
  supplierNo: '0000562281',
  vatId: 'DE353165506',
  subject: '2735706566',
  currency: 'EUR',
  deliveryTerms: 'ab Werk',
  paymentTerms: '14 Tage 2%, 30 Tage netto',
  shipTo: 'TE Connectivity Kissling Products GmbH\nWeidensteige 61\nDE - 75365 Calw',
  isFrame: true,
  items: [
    { pos: '10', artNr: '400200ABK', description: 'Stecker JPT 3er 9\nZolltarif-Nr.  : 85366990\nUrsprungsland  : DE\nArtikel-Nr./Kunde  : K1158038\nArtikel-Bez./Kunde  : JPT Stecker 9-Pins 400-200-A-BK\nBestell-Nr.-Kunde  : 2735706566\n\nMengenanpassung VPE=270 St',
      quantity: '1890', unit: 'ST', price: '1100.00' },
  ],
};

export function OrderDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ ...SAMPLE, items: SAMPLE.items.map(i => ({ ...i })) });
  const [busy, setBusy] = useState(false);

  const upd = (idx: number, patch: Partial<DemoItem>) =>
    setF(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, newItem()] }));
  const removeItem = (idx: number) => setF(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const generate = async () => {
    if (!f.abNo.trim()) return toast.error('AB-Nr. fehlt');
    setBusy(true);
    try {
      const items = f.items.map((it, i) => {
        const qty = parseFloat(it.quantity) || 0;
        const price = parseFloat(it.price) || 0;
        return {
          pos: it.pos || String((i + 1) * 10),
          artNr: it.artNr || null,
          description: it.description,
          quantity: qty || null,
          unit: it.unit || 'ST',
          price: price || null,
          positionValue: qty && price ? (qty * price) / (it.unit === 'ST' ? 1000 : 1) : null,
        };
      });
      const subtotal = items.reduce((s, it) => s + (it.positionValue || 0), 0);
      const tax = subtotal * 0.19;
      const data: ABData = {
        abNo: f.abNo.trim(),
        date: f.date ? new Date(f.date).toLocaleDateString('de-DE') : '',
        deliveryDate: f.deliveryDate || null,
        party: { name: f.recipientName, lines: f.recipientLines.split('\n').map(s => s.trim()).filter(Boolean) },
        contact: {
          customerNo: f.customerNo || null, contactName: f.contactName || null,
          phone: f.phone || null, fax: f.fax || null, email: f.email || null,
          supplierNo: f.supplierNo || null, vatId: f.vatId || null, subject: f.subject || null,
        },
        items, currency: f.currency || 'EUR',
        subtotal, tax, total: subtotal + tax, taxRate: 19,
        deliveryTerms: f.deliveryTerms || undefined,
        paymentTerms: f.paymentTerms || undefined,
        shipTo: f.shipTo ? f.shipTo.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        isFrame: f.isFrame,
      };
      await openOrderOverlayPdf(data, { demo: true });
      toast.success('Demo-PDF geöffnet');
    } catch (e: any) {
      toast.error(e?.message ?? 'PDF-Fehler');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Demo-Auftragsbestätigung erzeugen</DialogTitle>
          <DialogDescription>Formularfelder frei ausfüllen, PDF wird mit „DEMO"-Wasserzeichen erzeugt. Keine Daten werden gespeichert.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div><Label className="text-xs">AB-Nr.</Label><Input value={f.abNo} onChange={e => setF({ ...f, abNo: e.target.value })} /></div>
            <div><Label className="text-xs">Datum</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
            <div><Label className="text-xs">Liefertermin</Label><Input type="date" value={f.deliveryDate} onChange={e => setF({ ...f, deliveryDate: e.target.value })} /></div>
            <div><Label className="text-xs">Währung</Label><Input value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Empfänger — Name</Label>
              <Input value={f.recipientName} onChange={e => setF({ ...f, recipientName: e.target.value })} />
              <Label className="text-xs">Adresse (eine Zeile pro Zeilenumbruch)</Label>
              <textarea className="w-full min-h-[80px] rounded border bg-background p-2 text-sm" value={f.recipientLines} onChange={e => setF({ ...f, recipientLines: e.target.value })} />
              <Label className="text-xs">Lieferung an</Label>
              <textarea className="w-full min-h-[60px] rounded border bg-background p-2 text-sm" value={f.shipTo} onChange={e => setF({ ...f, shipTo: e.target.value })} />
            </div>
            <div className="space-y-2 grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Kunden-Nr.</Label><Input value={f.customerNo} onChange={e => setF({ ...f, customerNo: e.target.value })} /></div>
              <div><Label className="text-xs">Ansprechpartner</Label><Input value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} /></div>
              <div><Label className="text-xs">Telefon</Label><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
              <div><Label className="text-xs">Fax</Label><Input value={f.fax} onChange={e => setF({ ...f, fax: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">E-Mail</Label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
              <div><Label className="text-xs">Lieferanten-Nr.</Label><Input value={f.supplierNo} onChange={e => setF({ ...f, supplierNo: e.target.value })} /></div>
              <div><Label className="text-xs">USt-ID-Nr.</Label><Input value={f.vatId} onChange={e => setF({ ...f, vatId: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Betreff</Label><Input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></div>
              <div><Label className="text-xs">Lieferung</Label><Input value={f.deliveryTerms} onChange={e => setF({ ...f, deliveryTerms: e.target.value })} /></div>
              <div><Label className="text-xs">Zahlung</Label><Input value={f.paymentTerms} onChange={e => setF({ ...f, paymentTerms: e.target.value })} /></div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Positionen</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" /> Position</Button>
            </div>
            <Card className="p-2 space-y-2">
              {f.items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-start">
                  <Input className="col-span-1 h-8 text-xs" placeholder="Pos" value={it.pos} onChange={e => upd(idx, { pos: e.target.value })} />
                  <Input className="col-span-2 h-8 text-xs" placeholder="Art-Nr." value={it.artNr} onChange={e => upd(idx, { artNr: e.target.value })} />
                  <textarea className="col-span-5 min-h-[32px] rounded border bg-background p-1 text-xs" placeholder="Bezeichnung" value={it.description} onChange={e => upd(idx, { description: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Menge" value={it.quantity} onChange={e => upd(idx, { quantity: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Einh." value={it.unit} onChange={e => upd(idx, { unit: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Preis" value={it.price} onChange={e => upd(idx, { price: e.target.value })} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 col-span-1" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {f.items.length === 0 && <div className="text-xs text-muted-foreground p-2 text-center">Keine Positionen</div>}
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          <Button onClick={generate} disabled={busy}>
            <FileText className="h-4 w-4 mr-1" /> {busy ? 'Erzeuge…' : 'Demo-PDF öffnen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

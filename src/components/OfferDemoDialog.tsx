// Demo-Formular für Angebote — erzeugt eine Angebots-PDF mit
// DEMO-Wasserzeichen zum Prüfen der Vorlage (kein DB-Eintrag).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, FileText } from 'lucide-react';
import { openOfferOverlayPdf } from '@/lib/erp-pdf/offerOverlay';
import type { AngebotData } from '@/lib/erp-pdf/generators';
import { toast } from 'sonner';

type DemoItem = {
  artNr: string; description: string;
  quantity: string; unit: string; price: string;
};

const newItem = (): DemoItem => ({ artNr: '', description: '', quantity: '', unit: 'ST', price: '' });

const SAMPLE = {
  offerNo: '16120-01',
  date: new Date().toISOString().slice(0, 10),
  validUntil: '',
  recipientName: 'Muster Kunde AG',
  recipientLines: 'Product Solution Management\nHerr Mustermann\nMusterstrasse 70\n6301 Zug\nSWITZERLAND',
  customerNo: '11426',
  contactName: 'Frau Magnussen',
  phone: '+49 7940 989998-0',
  fax: '+49 7940 989998-9',
  email: 'Anja.Magnussen@mtcon.eu',
  subject: 'Alternative Powerelemente',
  deliveryTerms: 'ab Werk',
  paymentTerms: '14 Tage 2%, 30 Tage netto',
  notes: '',
  items: [
    { artNr: '02.3.0002.B',
      description: 'Power Socket M4, 9-er, rundum, RM 2,54 (3x) press-fit massiv\nÄnd-Index: B\nZolltarif-Nr.: 85369010\nUrsprungsland: DE',
      quantity: '500', unit: 'ST', price: '0.54' },
    { artNr: '02.1.0004.C',
      description: 'Power Socket M6, 10-er, vollflächig, RM 2,54 (3x) press-fit massiv',
      quantity: '1000', unit: 'ST', price: '0.75' },
  ],
};

export function OfferDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ ...SAMPLE, items: SAMPLE.items.map(i => ({ ...i })) });
  const [busy, setBusy] = useState(false);

  const updateItem = (idx: number, patch: Partial<DemoItem>) =>
    setF(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, newItem()] }));
  const removeItem = (idx: number) => setF(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const generate = async () => {
    if (!f.offerNo.trim()) return toast.error('Angebotsnummer fehlt');
    setBusy(true);
    try {
      const data: AngebotData = {
        offerNo: f.offerNo.trim(),
        date: f.date ? new Date(f.date).toLocaleDateString('de-DE') : '',
        validUntil: f.validUntil || null,
        party: {
          name: f.recipientName,
          lines: f.recipientLines.split('\n').map(s => s.trim()).filter(Boolean),
        },
        contact: {
          customerNo: f.customerNo || null,
          contactName: f.contactName || null,
          phone: f.phone || null,
          fax: f.fax || null,
          email: f.email || null,
          subject: f.subject || null,
        },
        items: f.items.map((it, i) => {
          const q = parseFloat(it.quantity) || 0;
          const p = parseFloat(it.price) || 0;
          return {
            pos: (i + 1) * 10,
            artNr: it.artNr || null,
            description: it.description,
            quantity: q || null,
            unit: it.unit || null,
            price: p || null,
            positionValue: q && p ? q * p : null,
          };
        }),
        currency: 'EUR',
        deliveryTerms: f.deliveryTerms || undefined,
        paymentTerms: f.paymentTerms || undefined,
        notes: f.notes || undefined,
      };
      await openOfferOverlayPdf(data, { demo: true });
      toast.success('Demo-PDF geöffnet');
    } catch (e: any) {
      toast.error(e?.message ?? 'PDF-Fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Demo-Angebot erzeugen
          </DialogTitle>
          <DialogDescription>
            Formularfelder frei ausfüllen, PDF wird mit „DEMO"-Wasserzeichen erzeugt. Keine Daten werden gespeichert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div><Label className="text-xs">Angebot-Nr.</Label><Input value={f.offerNo} onChange={e => setF({ ...f, offerNo: e.target.value })} /></div>
            <div><Label className="text-xs">Datum</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
            <div><Label className="text-xs">Gültig bis</Label><Input type="date" value={f.validUntil} onChange={e => setF({ ...f, validUntil: e.target.value })} /></div>
            <div><Label className="text-xs">Betreff</Label><Input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Empfänger — Name</Label>
              <Input value={f.recipientName} onChange={e => setF({ ...f, recipientName: e.target.value })} />
              <Label className="text-xs">Adresse (eine Zeile pro Zeilenumbruch)</Label>
              <Textarea rows={5} value={f.recipientLines} onChange={e => setF({ ...f, recipientLines: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Kunden-Nr.</Label><Input value={f.customerNo} onChange={e => setF({ ...f, customerNo: e.target.value })} /></div>
                <div><Label className="text-xs">Ansprechpartner</Label><Input value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} /></div>
                <div><Label className="text-xs">Telefon</Label><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
                <div><Label className="text-xs">Fax</Label><Input value={f.fax} onChange={e => setF({ ...f, fax: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-xs">E-Mail</Label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
                <div><Label className="text-xs">Lieferung</Label><Input value={f.deliveryTerms} onChange={e => setF({ ...f, deliveryTerms: e.target.value })} /></div>
                <div><Label className="text-xs">Zahlung</Label><Input value={f.paymentTerms} onChange={e => setF({ ...f, paymentTerms: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-xs">Anmerkungen</Label><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
              </div>
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
                  <Input className="col-span-2 h-8 text-xs" placeholder="Art-Nr." value={it.artNr} onChange={e => updateItem(idx, { artNr: e.target.value })} />
                  <Textarea className="col-span-5 min-h-8 h-8 text-xs" placeholder="Bezeichnung (mehrzeilig)" value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Menge" value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Einh." value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} />
                  <Input className="col-span-2 h-8 text-xs" placeholder="Preis" value={it.price} onChange={e => updateItem(idx, { price: e.target.value })} />
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

// Demo-Formular für Bestellungen (an Lieferant) — erzeugt eine Bestell-PDF
// mit DEMO-Wasserzeichen zum Prüfen der Vorlage (kein DB-Eintrag).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, FileText } from 'lucide-react';
import { openPurchaseOverlayPdf } from '@/lib/erp-pdf/purchaseOverlay';
import type { BestellungData } from '@/lib/erp-pdf/generators';
import { toast } from 'sonner';

type DemoItem = { pos: string; artNr: string; description: string; quantity: string; unit: string; price: string };
const newItem = (): DemoItem => ({ pos: '', artNr: '', description: '', quantity: '', unit: 'ST', price: '' });

const SAMPLE = {
  poNo: '16505',
  date: new Date().toISOString().slice(0, 10),
  expected: '2026-05-13',
  recipientName: 'SWS-Packaging GmbH',
  recipientLines: 'Bestellungen\nObere Losterbach 1/1\n75050 Gemmingen',
  supplierNo: '70002',
  contactName: 'Herr Stolz',
  phone: '+49 7940 989998-16',
  fax: '+49 7940 / 989998-9',
  email: 'meik.stolz@mtcon.eu',
  subject: 'WA15205',
  currency: 'EUR',
  notes: '',
  items: [
    { pos: '10', artNr: '299051ABK_FB',
      description: 'MTCON FastOn 028 female 2nd GEN 0164 [L]\nÄnd.-Nr.  :\nÄnd.-Datum  :\nZusammensetzung Kunststoffkörper mit Messerkontakte',
      quantity: '7017', unit: 'ST', price: '12.50' },
  ],
};

export function PurchaseDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ ...SAMPLE, items: SAMPLE.items.map(i => ({ ...i })) });
  const [busy, setBusy] = useState(false);

  const upd = (idx: number, patch: Partial<DemoItem>) =>
    setF(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, newItem()] }));
  const removeItem = (idx: number) => setF(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const generate = async () => {
    if (!f.poNo.trim()) return toast.error('Bestell-Nr. fehlt');
    setBusy(true);
    try {
      const data: BestellungData = {
        poNo: f.poNo.trim(),
        date: f.date ? new Date(f.date).toLocaleDateString('de-DE') : '',
        expected: f.expected || null,
        party: { name: f.recipientName, lines: f.recipientLines.split('\n').map(s => s.trim()).filter(Boolean) },
        contact: {
          supplierNo: f.supplierNo || null, contactName: f.contactName || null,
          phone: f.phone || null, fax: f.fax || null, email: f.email || null,
          subject: f.subject || null,
        },
        items: f.items.map((it, i) => {
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
        }),
        currency: f.currency || 'EUR',
        notes: f.notes || undefined,
      };
      await openPurchaseOverlayPdf(data, { demo: true });
      toast.success('Demo-PDF geöffnet');
    } catch (e: any) {
      toast.error(e?.message ?? 'PDF-Fehler');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Demo-Bestellung erzeugen</DialogTitle>
          <DialogDescription>Formularfelder frei ausfüllen, PDF wird mit „DEMO"-Wasserzeichen erzeugt. Keine Daten werden gespeichert.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div><Label className="text-xs">Bestell-Nr.</Label><Input value={f.poNo} onChange={e => setF({ ...f, poNo: e.target.value })} /></div>
            <div><Label className="text-xs">Bestelldatum</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
            <div><Label className="text-xs">Liefertermin</Label><Input type="date" value={f.expected} onChange={e => setF({ ...f, expected: e.target.value })} /></div>
            <div><Label className="text-xs">Währung</Label><Input value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Lieferant — Name</Label>
              <Input value={f.recipientName} onChange={e => setF({ ...f, recipientName: e.target.value })} />
              <Label className="text-xs">Adresse (eine Zeile pro Zeilenumbruch)</Label>
              <textarea className="w-full min-h-[80px] rounded border bg-background p-2 text-sm" value={f.recipientLines} onChange={e => setF({ ...f, recipientLines: e.target.value })} />
              <Label className="text-xs">Anmerkungen</Label>
              <Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} />
            </div>
            <div className="space-y-2 grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Lieferanten-Nr.</Label><Input value={f.supplierNo} onChange={e => setF({ ...f, supplierNo: e.target.value })} /></div>
              <div><Label className="text-xs">Bearbeiter</Label><Input value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} /></div>
              <div><Label className="text-xs">Telefon</Label><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
              <div><Label className="text-xs">Fax</Label><Input value={f.fax} onChange={e => setF({ ...f, fax: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Email</Label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
              <div className="col-span-2"><Label className="text-xs">Betreff</Label><Input value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} /></div>
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

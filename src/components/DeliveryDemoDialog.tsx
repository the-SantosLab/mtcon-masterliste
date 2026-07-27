// Demo-Formular für Lieferscheine — erzeugt eine Lieferschein-PDF mit
// DEMO-Wasserzeichen zum Prüfen der Vorlage (kein DB-Eintrag).
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, FileText } from 'lucide-react';
import { openDeliveryOverlayPdf } from '@/lib/erp-pdf/deliveryOverlay';
import type { LieferscheinData } from '@/lib/erp-pdf/generators';
import { toast } from 'sonner';

type DemoItem = {
  orderNo: string; pos: string;
  artNr: string; description: string;
  quantity: string; unit: string;
};

const newItem = (): DemoItem => ({
  orderNo: '', pos: '', artNr: '', description: '', quantity: '', unit: 'ST',
});

const SAMPLE = {
  deliveryNo: '19132',
  date: new Date().toISOString().slice(0, 10),
  orderNo: '18420',
  isReturn: false as boolean,
  recipientName: 'Muster Kunde GmbH',
  recipientLines: 'Musterstraße 12\n74676 Niedernhall\nDeutschland',
  customerNo: '11915',
  contactName: 'Herr Mustermann',
  phone: '+49 7940 989998-0',
  fax: '+49 7940 989998-9',
  email: 'kontakt@muster.de',
  deliveryTerms: 'DAP — frei Haus',
  packages: '2',
  notes: '',
  items: [
    { orderNo: '18420', pos: '10', artNr: '02.3.0002.B',
      description: 'Power Socket M4, 9-er, rundum, RM 2,54 (3x) press-fit massiv',
      quantity: '8400', unit: 'ST' },
    { orderNo: '18420', pos: '20', artNr: '02.3.0004.A',
      description: 'Power Socket M4, 5-er, seitlich, RM 2,54 press-fit',
      quantity: '3500', unit: 'ST' },
  ],
};

export function DeliveryDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ ...SAMPLE, items: SAMPLE.items.map(i => ({ ...i })) });
  const [busy, setBusy] = useState(false);

  const updateItem = (idx: number, patch: Partial<DemoItem>) =>
    setF(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, newItem()] }));
  const removeItem = (idx: number) => setF(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const generate = async () => {
    if (!f.deliveryNo.trim()) return toast.error('Lieferschein-Nr. fehlt');
    setBusy(true);
    try {
      const data: LieferscheinData = {
        deliveryNo: f.deliveryNo.trim(),
        date: f.date ? new Date(f.date).toLocaleDateString('de-DE') : '',
        orderNo: f.orderNo || null,
        isReturn: f.isReturn,
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
        },
        items: f.items.map((it, i) => ({
          orderNo: it.orderNo || undefined,
          pos: it.pos || String((i + 1) * 10),
          artNr: it.artNr || null,
          description: it.description,
          quantity: parseFloat(it.quantity) || null,
          unit: it.unit || null,
          price: null,
          positionValue: null,
        })),
        deliveryTerms: f.deliveryTerms || undefined,
        packages: f.packages ? parseInt(f.packages, 10) : undefined,
        notes: f.notes || undefined,
      };
      await openDeliveryOverlayPdf(data, { demo: true });
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
            <FileText className="h-4 w-4" /> Demo-Lieferschein erzeugen
          </DialogTitle>
          <DialogDescription>
            Formularfelder frei ausfüllen, PDF wird mit „DEMO"-Wasserzeichen erzeugt. Keine Daten werden gespeichert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div><Label className="text-xs">Lieferschein-Nr.</Label><Input value={f.deliveryNo} onChange={e => setF({ ...f, deliveryNo: e.target.value })} /></div>
            <div><Label className="text-xs">Datum</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
            <div><Label className="text-xs">Auftrag-Nr.</Label><Input value={f.orderNo} onChange={e => setF({ ...f, orderNo: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Typ</Label>
              <Select value={f.isReturn ? 'return' : 'delivery'} onValueChange={(v) => setF({ ...f, isReturn: v === 'return' })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="delivery">Lieferschein</SelectItem>
                  <SelectItem value="return">Rücklieferschein</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Empfänger — Name</Label>
              <Input value={f.recipientName} onChange={e => setF({ ...f, recipientName: e.target.value })} />
              <Label className="text-xs">Adresse (eine Zeile pro Zeilenumbruch)</Label>
              <Textarea rows={4} value={f.recipientLines} onChange={e => setF({ ...f, recipientLines: e.target.value })} />
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Kunden-Nr.</Label><Input value={f.customerNo} onChange={e => setF({ ...f, customerNo: e.target.value })} /></div>
                <div><Label className="text-xs">Ansprechpartner</Label><Input value={f.contactName} onChange={e => setF({ ...f, contactName: e.target.value })} /></div>
                <div><Label className="text-xs">Telefon</Label><Input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
                <div><Label className="text-xs">Fax</Label><Input value={f.fax} onChange={e => setF({ ...f, fax: e.target.value })} /></div>
                <div className="col-span-2"><Label className="text-xs">E-Mail</Label><Input value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
                <div><Label className="text-xs">Lieferung</Label><Input value={f.deliveryTerms} onChange={e => setF({ ...f, deliveryTerms: e.target.value })} /></div>
                <div><Label className="text-xs">Packstücke</Label><Input value={f.packages} onChange={e => setF({ ...f, packages: e.target.value })} /></div>
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
                  <Input className="col-span-2 h-8 text-xs" placeholder="Auftr-Nr" value={it.orderNo} onChange={e => updateItem(idx, { orderNo: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Pos" value={it.pos} onChange={e => updateItem(idx, { pos: e.target.value })} />
                  <Input className="col-span-2 h-8 text-xs" placeholder="Art-Nr." value={it.artNr} onChange={e => updateItem(idx, { artNr: e.target.value })} />
                  <Input className="col-span-4 h-8 text-xs" placeholder="Bestelldaten" value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Menge" value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Einh." value={it.unit} onChange={e => updateItem(idx, { unit: e.target.value })} />
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

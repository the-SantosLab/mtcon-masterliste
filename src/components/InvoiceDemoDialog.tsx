// Demo-Formular: erzeugt eine Rechnung mit DEMO-Wasserzeichen zum
// Testen der PDF-Qualität — ohne DB-Eintrag, ohne Workflow.
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, FileText } from 'lucide-react';
import { openInvoiceOverlayPdf } from '@/lib/erp-pdf/invoiceOverlay';
import type { RechnungData } from '@/lib/erp-pdf/generators';
import { toast } from 'sonner';

type DemoItem = {
  deliveryNo: string; deliveryDate: string;
  artNr: string; description: string;
  quantity: string; unit: string; price: string;
};

const newItem = (): DemoItem => ({
  deliveryNo: '', deliveryDate: '',
  artNr: '', description: '',
  quantity: '', unit: '1000', price: '',
});

const SAMPLE = {
  invoiceNo: '18831',
  date: new Date().toISOString().slice(0, 10),
  dueDate: '',
  language: 'de' as 'de' | 'en',
  currency: 'EUR',
  paymentTerms: '30 Tage netto',
  recipientName: 'Muster Kunde GmbH',
  recipientLines: 'Musterstraße 12\n74676 Niedernhall\nDeutschland',
  customerNo: '11915',
  contactName: 'Herr Mustermann',
  phone: '+49 7940 989998-0',
  fax: '+49 7940 989998-9',
  email: 'kontakt@muster.de',
  items: [
    { deliveryNo: '19132', deliveryDate: new Date().toISOString().slice(0, 10),
      artNr: '02.3.0002.B', description: 'Power Socket M4, 9-er, rundum, RM 2,54 (3x) press-fit massiv',
      quantity: '8400', unit: '1000', price: '492.73' },
    { deliveryNo: '19133', deliveryDate: new Date().toISOString().slice(0, 10),
      artNr: '02.3.0002.B', description: 'Power Socket M4, 9-er, rundum, RM 2,54 (3x) press-fit massiv',
      quantity: '3500', unit: '1000', price: '492.73' },
  ],
};

export function InvoiceDemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ ...SAMPLE, items: SAMPLE.items.map(i => ({ ...i })) });
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    let sub = 0;
    for (const it of f.items) {
      const q = parseFloat(it.quantity) || 0;
      const p = parseFloat(it.price) || 0;
      const per = parseFloat(it.unit) || 1;
      sub += (q / per) * p;
    }
    const taxRate = f.currency === 'USD' ? 0 : 19;
    const tax = sub * (taxRate / 100);
    return { sub, tax, total: sub + tax, taxRate };
  }, [f.items, f.currency]);

  const updateItem = (idx: number, patch: Partial<DemoItem>) => {
    setF(prev => ({ ...prev, items: prev.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };
  const addItem = () => setF(prev => ({ ...prev, items: [...prev.items, newItem()] }));
  const removeItem = (idx: number) => setF(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const generate = async () => {
    if (!f.invoiceNo.trim()) return toast.error('Rechnungsnummer fehlt');
    setBusy(true);
    try {
      const data: RechnungData = {
        invoiceNo: f.invoiceNo.trim(),
        date: f.date ? new Date(f.date).toLocaleDateString(f.language === 'en' ? 'en-GB' : 'de-DE') : '',
        dueDate: f.dueDate || null,
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
        items: f.items.map(it => {
          const q = parseFloat(it.quantity) || 0;
          const p = parseFloat(it.price) || 0;
          const per = parseFloat(it.unit) || 1;
          return {
            deliveryNo: it.deliveryNo || undefined,
            deliveryDate: it.deliveryDate || undefined,
            artNr: it.artNr || null,
            description: it.description,
            quantity: q || null,
            unit: it.unit || null,
            price: p || null,
            positionValue: q && p ? (q / per) * p : null,
          };
        }),
        currency: f.currency,
        subtotal: totals.sub,
        tax: totals.tax,
        total: totals.total,
        taxRate: totals.taxRate,
        paymentTerms: f.paymentTerms || undefined,
        language: f.language,
      };
      await openInvoiceOverlayPdf(data, { demo: true });
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
            <FileText className="h-4 w-4" /> Demo-Rechnung erzeugen
          </DialogTitle>
          <DialogDescription>
            Formularfelder frei ausfüllen, PDF wird mit „DEMO"-Wasserzeichen erzeugt. Keine Daten werden gespeichert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-4 gap-3">
            <div><Label className="text-xs">Rechnungsnr.</Label><Input value={f.invoiceNo} onChange={e => setF({ ...f, invoiceNo: e.target.value })} /></div>
            <div><Label className="text-xs">Datum</Label><Input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></div>
            <div><Label className="text-xs">Fällig am</Label><Input type="date" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Sprache / Währung</Label>
              <div className="flex gap-1">
                <Select value={f.language} onValueChange={(v: any) => setF({ ...f, language: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="de">DE</SelectItem><SelectItem value="en">EN</SelectItem></SelectContent>
                </Select>
                <Select value={f.currency} onValueChange={(v) => setF({ ...f, currency: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="EUR">EUR</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
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
                <div className="col-span-2"><Label className="text-xs">Zahlung</Label><Input value={f.paymentTerms} onChange={e => setF({ ...f, paymentTerms: e.target.value })} /></div>
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
                  <Input className="col-span-2 h-8 text-xs" placeholder="Lieferschein" value={it.deliveryNo} onChange={e => updateItem(idx, { deliveryNo: e.target.value })} />
                  <Input className="col-span-2 h-8 text-xs" type="date" value={it.deliveryDate} onChange={e => updateItem(idx, { deliveryDate: e.target.value })} />
                  <Input className="col-span-2 h-8 text-xs" placeholder="Art-Nr." value={it.artNr} onChange={e => updateItem(idx, { artNr: e.target.value })} />
                  <Input className="col-span-3 h-8 text-xs" placeholder="Bezeichnung" value={it.description} onChange={e => updateItem(idx, { description: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Menge" value={it.quantity} onChange={e => updateItem(idx, { quantity: e.target.value })} />
                  <Input className="col-span-1 h-8 text-xs" placeholder="Preis" value={it.price} onChange={e => updateItem(idx, { price: e.target.value })} />
                  <Button size="icon" variant="ghost" className="h-8 w-8 col-span-1" onClick={() => removeItem(idx)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              {f.items.length === 0 && <div className="text-xs text-muted-foreground p-2 text-center">Keine Positionen</div>}
            </Card>
            <div className="flex justify-end gap-4 text-xs mt-2 text-muted-foreground">
              <span>Netto: <span className="tabular-nums text-foreground">{totals.sub.toFixed(2)}</span></span>
              <span>USt ({totals.taxRate}%): <span className="tabular-nums text-foreground">{totals.tax.toFixed(2)}</span></span>
              <span>Gesamt: <span className="tabular-nums text-foreground font-medium">{totals.total.toFixed(2)} {f.currency}</span></span>
            </div>
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

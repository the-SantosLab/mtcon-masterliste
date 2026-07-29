import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Truck, Receipt, Percent } from "lucide-react";

export type FulfillRow = {
  item: { id: string; position: number; description: string; unit: string | null; quantity: number; unit_price?: number | null; tax_rate?: number | null };
  art_nr: string | null;
  delivered: number;
  invoiced: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string;
  rows: FulfillRow[];
  warehouseId: string;
  onDone?: () => void;
  defaultMode?: "delivery" | "invoice";
};

export function PartialFulfillDialog({ open, onOpenChange, orderId, rows, warehouseId, onDone, defaultMode = "delivery" }: Props) {
  const [mode, setMode] = useState<"delivery" | "invoice" | "downpayment">(defaultMode);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [downPct, setDownPct] = useState<string>("30");
  const [downLabel, setDownLabel] = useState<string>("Abschlagsrechnung");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(defaultMode);
    const initial: Record<string, string> = {};
    rows.forEach(r => {
      const openDlv = Math.max(0, r.item.quantity - r.delivered);
      const openInv = Math.max(0, r.delivered - r.invoiced);
      initial[r.item.id] = String(defaultMode === "invoice" ? openInv : openDlv);
    });
    setQty(initial);
  }, [open, defaultMode, rows]);

  // when switching mode, reset defaults to that mode's "open" quantity
  useEffect(() => {
    const initial: Record<string, string> = {};
    rows.forEach(r => {
      const openDlv = Math.max(0, r.item.quantity - r.delivered);
      const openInv = Math.max(0, r.delivered - r.invoiced);
      initial[r.item.id] = String(mode === "invoice" ? openInv : mode === "delivery" ? openDlv : 0);
    });
    setQty(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const selectedItems = useMemo(() => {
    return rows
      .map(r => {
        const q = Number(qty[r.item.id] || 0);
        const maxAllowed = mode === "invoice"
          ? Math.max(0, r.delivered - r.invoiced)
          : Math.max(0, r.item.quantity - r.delivered);
        const clamped = Math.max(0, Math.min(q, maxAllowed));
        return { row: r, quantity: clamped };
      })
      .filter(x => x.quantity > 0);
  }, [qty, rows, mode]);

  const runDelivery = async () => {
    if (!warehouseId) return toast.error("Lager wählen");
    if (!selectedItems.length) return toast.info("Keine Mengen eingetragen");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: d, error } = await (supabase.from("deliveries" as any).insert({
      order_id: orderId, status: "draft",
      delivery_date: new Date().toISOString().slice(0, 10),
      created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !d) { setBusy(false); return toast.error(error?.message || "Fehler"); }

    const payload = selectedItems.map(x => ({
      delivery_id: d.id, order_item_id: x.row.item.id, position: x.row.item.position,
      art_nr: x.row.art_nr, description: x.row.item.description, quantity: x.quantity,
      unit: x.row.item.unit, warehouse_id: warehouseId,
    }));
    const { error: e2 } = await (supabase.from("delivery_items" as any).insert(payload)) as any;
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success(`Lieferschein ${d.delivery_no} angelegt (${selectedItems.length} Position(en))`);
    onOpenChange(false);
    onDone?.();
  };

  const runInvoice = async () => {
    if (!selectedItems.length) return toast.info("Keine Mengen eingetragen");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: order } = await supabase.from("orders").select("customer_name, customer_email, customer_no").eq("id", orderId).single();
    const items = selectedItems.map(x => {
      const up = x.row.item.unit_price != null ? Number(x.row.item.unit_price) : null;
      const rate = x.row.item.tax_rate != null ? Number(x.row.item.tax_rate) : 19;
      return {
        position: x.row.item.position, art_nr: x.row.art_nr, description: x.row.item.description,
        quantity: x.quantity, unit: x.row.item.unit, unit_price: up, tax_rate: rate,
        line_total: up != null ? x.quantity * up : null,
        order_item_id: x.row.item.id,
      };
    });
    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0), 0);
    const tax = items.reduce((s: number, it: any) => s + (Number(it.line_total) || 0) * (Number(it.tax_rate || 0) / 100), 0);
    const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 14);

    const { data: inv, error } = await (supabase.from("invoices" as any).insert({
      order_id: orderId, status: "draft", doc_kind: "invoice",
      invoice_date: today.toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10),
      customer_name: order?.customer_name, customer_email: order?.customer_email, customer_no: order?.customer_no,
      currency: "EUR", subtotal_amount: subtotal, tax_amount: tax, total_amount: subtotal + tax,
      created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !inv) { setBusy(false); return toast.error(error?.message || "Fehler"); }
    await (supabase.from("invoice_items" as any).insert(items.map(it => ({ ...it, invoice_id: inv.id })))) as any;
    setBusy(false);
    toast.success(`Rechnung ${inv.invoice_no} angelegt (Teilrechnung, ${items.length} Position(en))`);
    onOpenChange(false);
    onDone?.();
  };

  const runDownpayment = async () => {
    const pct = Number(downPct);
    if (!(pct > 0 && pct <= 100)) return toast.error("Prozentsatz 1–100 %");
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: order } = await supabase.from("orders")
      .select("customer_name, customer_email, customer_no, subtotal_amount, tax_amount, total_amount, order_no")
      .eq("id", orderId).single();
    if (!order) { setBusy(false); return toast.error("Auftrag nicht gefunden"); }

    const subtotal = Number(order.subtotal_amount || 0) * pct / 100;
    const rate = Number(order.subtotal_amount || 0) > 0
      ? (Number(order.tax_amount || 0) / Number(order.subtotal_amount || 1)) * 100
      : 19;
    const tax = subtotal * rate / 100;
    const today = new Date(); const due = new Date(); due.setDate(due.getDate() + 14);

    const { data: inv, error } = await (supabase.from("invoices" as any).insert({
      order_id: orderId, status: "draft", doc_kind: "invoice",
      invoice_date: today.toISOString().slice(0, 10), due_date: due.toISOString().slice(0, 10),
      customer_name: order.customer_name, customer_email: order.customer_email, customer_no: order.customer_no,
      currency: "EUR", subtotal_amount: subtotal, tax_amount: tax, total_amount: subtotal + tax,
      notes: `${downLabel} ${pct}% zu Auftrag ${order.order_no}`,
      created_by: user?.id ?? null,
    }).select().single()) as any;
    if (error || !inv) { setBusy(false); return toast.error(error?.message || "Fehler"); }

    await (supabase.from("invoice_items" as any).insert([{
      invoice_id: inv.id, position: 1, art_nr: null,
      description: `${downLabel} ${pct}% zu Auftrag ${order.order_no}`,
      quantity: 1, unit: "pauschal", unit_price: subtotal, tax_rate: rate,
      line_total: subtotal, order_item_id: null,
    }])) as any;

    setBusy(false);
    toast.success(`${downLabel} ${inv.invoice_no} angelegt`);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Teil-Abwicklung</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="delivery"><Truck className="h-3 w-3 mr-1" /> Teil-Lieferschein</TabsTrigger>
            <TabsTrigger value="invoice"><Receipt className="h-3 w-3 mr-1" /> Teil-Rechnung</TabsTrigger>
            <TabsTrigger value="downpayment"><Percent className="h-3 w-3 mr-1" /> Abschlag</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="mt-3">
            <PositionTable rows={rows} qty={qty} setQty={setQty} mode="delivery" />
          </TabsContent>

          <TabsContent value="invoice" className="mt-3">
            <div className="text-[11px] text-muted-foreground mb-2">Es können nur bereits gelieferte, aber noch nicht berechnete Mengen fakturiert werden.</div>
            <PositionTable rows={rows} qty={qty} setQty={setQty} mode="invoice" />
          </TabsContent>

          <TabsContent value="downpayment" className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prozentsatz vom Auftragswert</Label>
                <Input type="number" min={1} max={100} value={downPct} onChange={(e) => setDownPct(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Bezeichnung</Label>
                <Input value={downLabel} onChange={(e) => setDownLabel(e.target.value)} />
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Erzeugt eine Rechnung ohne Positionsbindung mit einer Sammelzeile in Höhe des gewählten Prozentsatzes.
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Abbrechen</Button>
          {mode === "delivery" && <Button disabled={busy} onClick={runDelivery}><Truck className="h-3 w-3 mr-1" /> Lieferschein anlegen</Button>}
          {mode === "invoice" && <Button disabled={busy} onClick={runInvoice}><Receipt className="h-3 w-3 mr-1" /> Rechnung anlegen</Button>}
          {mode === "downpayment" && <Button disabled={busy} onClick={runDownpayment}><Percent className="h-3 w-3 mr-1" /> Abschlag anlegen</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PositionTable({
  rows, qty, setQty, mode,
}: {
  rows: FulfillRow[];
  qty: Record<string, string>;
  setQty: (v: Record<string, string>) => void;
  mode: "delivery" | "invoice";
}) {
  return (
    <div className="max-h-[50vh] overflow-auto border border-border/40 rounded">
      <table className="w-full text-xs">
        <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground sticky top-0">
          <tr>
            <th className="text-left p-2">Pos</th>
            <th className="text-left p-2">Artikel</th>
            <th className="text-left p-2">Bezeichnung</th>
            <th className="text-right p-2">Bestellt</th>
            <th className="text-right p-2">Geliefert</th>
            <th className="text-right p-2">Berechnet</th>
            <th className="text-right p-2">Offen</th>
            <th className="text-right p-2 w-32">Menge {mode === "invoice" ? "berechnen" : "liefern"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const openDlv = Math.max(0, r.item.quantity - r.delivered);
            const openInv = Math.max(0, r.delivered - r.invoiced);
            const openHere = mode === "invoice" ? openInv : openDlv;
            const disabled = openHere <= 0;
            return (
              <tr key={r.item.id} className="border-t border-border/40">
                <td className="p-2 tabular-nums">{r.item.position}</td>
                <td className="p-2 font-mono">{r.art_nr || "—"}</td>
                <td className="p-2">{r.item.description}</td>
                <td className="p-2 text-right tabular-nums">{r.item.quantity} {r.item.unit || ""}</td>
                <td className="p-2 text-right tabular-nums">{r.delivered || "—"}</td>
                <td className="p-2 text-right tabular-nums">{r.invoiced || "—"}</td>
                <td className="p-2 text-right tabular-nums">{openHere || "—"}</td>
                <td className="p-2 text-right">
                  <Input
                    type="number" min={0} max={openHere} step="any"
                    className="h-7 text-xs text-right"
                    disabled={disabled}
                    value={qty[r.item.id] ?? ""}
                    onChange={(e) => setQty({ ...qty, [r.item.id]: e.target.value })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

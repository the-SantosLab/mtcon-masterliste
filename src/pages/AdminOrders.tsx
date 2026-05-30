import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, FileText, Download, Package } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Order = {
  id: string;
  order_no: string;
  status: string;
  source: string;
  order_kind: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_no: string | null;
  external_order_no: string | null;
  order_date: string | null;
  delivery_date: string | null;
  payment_terms: string | null;
  currency: string;
  total_amount: number | null;
  subtotal_amount: number | null;
  tax_amount: number | null;
  notes: string | null;
  tags: string[];
  created_at: string;
};

type Item = {
  id: string;
  order_id: string;
  position: number;
  sku: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  tax_rate: number | null;
};

type Doc = {
  id: string;
  storage_path: string;
  file_name: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "KI-Entwurf",
  active: "Aktiv",
  in_progress: "In Bearbeitung",
  completed: "Erledigt",
  cancelled: "Storniert",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  cancelled: "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [aiOriginal, setAiOriginal] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setOrders((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openOrder = async (o: Order) => {
    setSelected(o);
    setAiOriginal({
      customer_name: o.customer_name,
      customer_no: o.customer_no,
      external_order_no: o.external_order_no,
      delivery_date: o.delivery_date,
      total_amount: o.total_amount,
      payment_terms: o.payment_terms,
    });
    const [{ data: its }, { data: ds }] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", o.id).order("position"),
      supabase.from("order_documents").select("id, storage_path, file_name").eq("order_id", o.id),
    ]);
    setItems((its as any) || []);
    setDocs((ds as any) || []);
  };

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const draftCount = orders.filter((o) => o.status === "draft").length;

  const save = async () => {
    if (!selected) return;
    const corrections: any[] = [];
    if (selected.source === "email_intake") {
      for (const k of Object.keys(aiOriginal)) {
        const before = aiOriginal[k];
        const after = (selected as any)[k];
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          corrections.push({
            order_id: selected.id,
            field: k,
            ai_value: before,
            corrected_value: after,
          });
        }
      }
    }
    const { error } = await supabase
      .from("orders")
      .update({
        customer_name: selected.customer_name,
        customer_email: selected.customer_email,
        customer_no: selected.customer_no,
        external_order_no: selected.external_order_no,
        order_date: selected.order_date,
        delivery_date: selected.delivery_date,
        payment_terms: selected.payment_terms,
        currency: selected.currency,
        subtotal_amount: selected.subtotal_amount,
        tax_amount: selected.tax_amount,
        total_amount: selected.total_amount,
        notes: selected.notes,
        status: selected.status,
        order_kind: selected.order_kind,
      })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    if (corrections.length > 0) {
      await supabase.from("order_intake_corrections").insert(corrections);
    }
    toast.success("Gespeichert");
    setSelected(null);
    load();
  };

  const activate = async () => {
    if (!selected) return;
    await save();
    const { error } = await supabase.from("orders").update({ status: "active" }).eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Als aktiv übernommen");
    setSelected(null);
    load();
  };

  const downloadDoc = async (d: Doc) => {
    const { data, error } = await supabase.storage
      .from("order-documents")
      .createSignedUrl(d.storage_path, 300);
    if (error || !data?.signedUrl) return toast.error("Download fehlgeschlagen");
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bestellungen
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eingehende Bestellungen — automatisch via E-Mail erfasst oder manuell angelegt.
          </p>
        </div>
        <div className="flex gap-2">
          {["all", "draft", "active", "in_progress", "completed", "cancelled"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
              className="text-xs"
            >
              {s === "all" ? "Alle" : STATUS_LABELS[s]}
              {s === "draft" && draftCount > 0 && (
                <Badge className="ml-2 bg-violet-500/30 text-violet-100">{draftCount}</Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3 font-medium">Nr.</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Kunde</th>
              <th className="text-left p-3 font-medium">Best.-Nr. Kunde</th>
              <th className="text-left p-3 font-medium">Liefertermin</th>
              <th className="text-right p-3 font-medium">Summe</th>
              <th className="text-left p-3 font-medium">Quelle</th>
              <th className="text-left p-3 font-medium">Erstellt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Lade…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  Keine Bestellungen
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-border/40 hover:bg-muted/20 cursor-pointer"
                  onClick={() => openOrder(o)}
                >
                  <td className="p-3 font-mono text-xs">{o.order_no}</td>
                  <td className="p-3">
                    <Badge className={STATUS_COLORS[o.status] || ""} variant="outline">
                      {o.status === "draft" && <Sparkles className="h-3 w-3 mr-1" />}
                      {STATUS_LABELS[o.status] || o.status}
                    </Badge>
                  </td>
                  <td className="p-3">{o.customer_name || "—"}</td>
                  <td className="p-3 font-mono text-xs">{o.external_order_no || "—"}</td>
                  <td className="p-3">{o.delivery_date || "—"}</td>
                  <td className="p-3 text-right tabular-nums">
                    {o.total_amount != null
                      ? `${o.total_amount.toLocaleString("de-DE", { minimumFractionDigits: 2 })} ${o.currency}`
                      : "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {o.source === "email_intake" ? "E-Mail" : "Manuell"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {format(new Date(o.created_at), "dd.MM.yyyy HH:mm")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono">{selected?.order_no}</span>
              {selected && (
                <Badge className={STATUS_COLORS[selected.status]} variant="outline">
                  {STATUS_LABELS[selected.status]}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {selected.status === "draft" && (
                <div className="p-3 rounded-md bg-violet-500/10 border border-violet-500/30 text-sm flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5 text-violet-300" />
                  <div className="flex-1">
                    <div className="font-medium text-violet-200">KI-Entwurf aus E-Mail</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Bitte Felder und Positionen prüfen, dann „Als aktiv übernehmen". Korrekturen werden
                      zur Verbesserung der Extraktion gespeichert.
                    </div>
                  </div>
                  <Button size="sm" onClick={activate}>
                    Als aktiv übernehmen
                  </Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Kunde</Label>
                  <Input
                    value={selected.customer_name || ""}
                    onChange={(e) => setSelected({ ...selected, customer_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Kunden-Nr.</Label>
                  <Input
                    value={selected.customer_no || ""}
                    onChange={(e) => setSelected({ ...selected, customer_no: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">E-Mail</Label>
                  <Input
                    value={selected.customer_email || ""}
                    onChange={(e) => setSelected({ ...selected, customer_email: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bestell-Nr. Kunde</Label>
                  <Input
                    value={selected.external_order_no || ""}
                    onChange={(e) => setSelected({ ...selected, external_order_no: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Bestelldatum</Label>
                  <Input
                    type="date"
                    value={selected.order_date || ""}
                    onChange={(e) => setSelected({ ...selected, order_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Liefertermin</Label>
                  <Input
                    type="date"
                    value={selected.delivery_date || ""}
                    onChange={(e) => setSelected({ ...selected, delivery_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Zahlungsbedingungen</Label>
                  <Input
                    value={selected.payment_terms || ""}
                    onChange={(e) => setSelected({ ...selected, payment_terms: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Summe</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      value={selected.total_amount ?? ""}
                      onChange={(e) =>
                        setSelected({
                          ...selected,
                          total_amount: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                    <Input
                      className="w-20"
                      value={selected.currency}
                      onChange={(e) => setSelected({ ...selected, currency: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={selected.status}
                    onValueChange={(v) => setSelected({ ...selected, status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Art</Label>
                  <Select
                    value={selected.order_kind}
                    onValueChange={(v) => setSelected({ ...selected, order_kind: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Neuauftrag</SelectItem>
                      <SelectItem value="change">Änderung</SelectItem>
                      <SelectItem value="cancellation">Stornierung</SelectItem>
                      <SelectItem value="other">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {items.length > 0 && (
                <div>
                  <Label className="text-xs">Positionen</Label>
                  <Card className="mt-1 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 text-[10px] uppercase text-muted-foreground">
                        <tr>
                          <th className="text-left p-2">#</th>
                          <th className="text-left p-2">Artikel</th>
                          <th className="text-left p-2">Bezeichnung</th>
                          <th className="text-right p-2">Menge</th>
                          <th className="text-right p-2">EP</th>
                          <th className="text-right p-2">Summe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id} className="border-t border-border/40">
                            <td className="p-2">{it.position}</td>
                            <td className="p-2 font-mono">{it.sku || "—"}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right tabular-nums">
                              {it.quantity} {it.unit || ""}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {it.unit_price?.toFixed(2) ?? "—"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {it.line_total?.toFixed(2) ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}

              {docs.length > 0 && (
                <div>
                  <Label className="text-xs">Dokumente</Label>
                  <div className="mt-1 space-y-1">
                    {docs.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => downloadDoc(d)}
                        className="flex items-center gap-2 text-sm hover:text-primary"
                      >
                        <FileText className="h-4 w-4" />
                        {d.file_name}
                        <Download className="h-3 w-3 ml-auto" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Notizen</Label>
                <Textarea
                  rows={4}
                  value={selected.notes || ""}
                  onChange={(e) => setSelected({ ...selected, notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Abbrechen
            </Button>
            <Button onClick={save}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

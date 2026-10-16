import { ProcurementHeader } from '@/components/erp/ProcurementHeader';
import { FulfillmentHeader, FulfillmentMetrics } from '@/components/erp/FulfillmentHeader';
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
import { useLocation, useNavigate } from "react-router-dom";
import { Sparkles, FileText, Download, Package, ArrowLeft, FlaskConical } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { OrderFulfillment } from "@/components/OrderFulfillment";
import { ErpDocPdfButton } from "@/components/ErpDocPdfButton";
import { PartnerPicker } from "@/components/PartnerPicker";
import { OrderDemoDialog } from "@/components/OrderDemoDialog";
import { PurchaseDemoDialog } from "@/components/PurchaseDemoDialog";
import { CaseLinkSelect } from "@/components/erp/CaseLinkSelect";
import { toast } from "sonner";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IssosOrdersTab } from "@/components/IssosOrdersTab";


type Order = {
  id: string;
  order_no: string;
  status: string;
  source: string;
  order_kind: string;
  company_id: string | null;
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
  draft: "bg-status-working/15 text-status-working border-status-working/30",
  active: "bg-status-done/15 text-status-done border-status-done/30",
  in_progress: "bg-status-overdue/15 text-status-overdue border-status-overdue/30",
  completed: "bg-status-open/15 text-status-open border-status-open/30",
  cancelled: "bg-status-rejected/15 text-status-rejected border-status-rejected/30",
};

export default function AdminOrders() {
  const { pathname } = useLocation();
  const isProcurement = pathname === "/bestellungen";
  const PageHeader = isProcurement ? ProcurementHeader : FulfillmentHeader;
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [aiOriginal, setAiOriginal] = useState<Record<string, any>>({});
  const [demoOrderOpen, setDemoOrderOpen] = useState(false);
  const [demoPurchaseOpen, setDemoPurchaseOpen] = useState(false);


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
    const query = search.trim().toLowerCase();
    return orders.filter(o => (filter === "all" || o.status === filter) && (!query || `${o.order_no} ${o.customer_name || ""} ${o.external_order_no || ""}`.toLowerCase().includes(query)));
  }, [orders, filter, search]);

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
        company_id: selected.company_id,
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
        case_id: (selected as any).case_id ?? null,
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
    <AppLayout>
    <div className={isProcurement ? "fulfillment-page procurement-page" : "fulfillment-page"}>
      <PageHeader title={isProcurement ? "Bestellungen" : "Aufträge"} subtitle="Auftragseingang · Bearbeitung · Lieferung" actions={<>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>Aktualisieren</Button>
        <Button size="sm" variant="outline" onClick={() => setDemoOrderOpen(true)}><FlaskConical className="h-4 w-4" /> Demo Auftragsbestätigung</Button>
        <Button size="sm" variant="outline" onClick={() => setDemoPurchaseOpen(true)}><FlaskConical className="h-4 w-4" /> Demo Bestellung</Button>
      </>} />
      <Tabs defaultValue="internal" className="space-y-4">
        <TabsList>
          <TabsTrigger value="internal">Interne Bestellungen</TabsTrigger>
          <TabsTrigger value="issos">ISSOS-Terminaufträge</TabsTrigger>
        </TabsList>

        <TabsContent value="internal" className="space-y-4">
          <FulfillmentMetrics loading={loading} metrics={[
            { label: 'Aufträge gesamt', value: orders.length, onClick: () => setFilter('all'), active: filter === 'all' },
            { label: 'Entwürfe prüfen', value: draftCount, tone: 'working', onClick: () => setFilter('draft'), active: filter === 'draft' },
            { label: 'In Bearbeitung', value: orders.filter(o => o.status === 'in_progress').length, tone: 'working', onClick: () => setFilter('in_progress'), active: filter === 'in_progress' },
            { label: 'Erledigt', value: orders.filter(o => o.status === 'completed').length, tone: 'done', onClick: () => setFilter('completed'), active: filter === 'completed' },
          ]} />
          <div className="fulfillment-toolbar">
            <Input aria-label="Aufträge suchen" placeholder="Auftrag, Kunde oder Kunden-Bestellnummer…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm h-9 text-xs" />
            <Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-44 h-9 text-xs" aria-label="Auftragsstatus"><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent></Select>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} Aufträge</span>
          </div>
          <Card className="fulfillment-table">
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
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Lade…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
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
                      <td className="p-1 text-right" onClick={(e) => e.stopPropagation()}>
                        <ErpDocPdfButton type="ab" id={o.id} iconOnly variant="ghost" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="issos">
          <IssosOrdersTab />
        </TabsContent>
      </Tabs>


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
              {selected && !isProcurement && (
                <Button size="sm" variant="outline" className="ml-auto mr-6" onClick={() => navigate(`/orders/${selected.id}/akte`)}>
                  Vorgangsakte
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              {selected.status === "draft" && (
                <div className="p-3 rounded-md bg-status-working/10 border border-status-working/30 text-sm flex items-start gap-2">
                  <Sparkles className="h-4 w-4 mt-0.5 text-status-working" />
                  <div className="flex-1">
                    <div className="font-medium text-status-working">KI-Entwurf aus E-Mail</div>
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
                <div className="col-span-2">
                  <Label className="text-xs">Geschäftspartner</Label>
                  <PartnerPicker
                    value={selected.company_id}
                    role="customer"
                    onChange={(id, p) => {
                      setSelected({
                        ...selected,
                        company_id: id,
                        ...(p ? {
                          customer_name: p.name,
                          customer_email: p.email,
                          customer_no: p.customer_no,
                        } : {}),
                      });
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Auswählen, neu anlegen oder leeren. Freitextfelder unten werden beim Auswählen vorbefüllt.
                  </p>
                </div>
                <div className="col-span-2">
                  <CaseLinkSelect
                    value={(selected as any).case_id ?? null}
                    onChange={(v) => setSelected({ ...(selected as any), case_id: v })}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Bei Abschluss des Auftrags wird der verknüpfte Vorgang automatisch abgeschlossen.
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Kunde (Text)</Label>
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

              {selected.status !== 'draft' && <OrderFulfillment orderId={selected.id} />}

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
            {selected && <ErpDocPdfButton type="ab" id={selected.id} label="Auftragsbestätigung" />}
            <Button variant="outline" onClick={() => setSelected(null)}>
              Abbrechen
            </Button>
            <Button onClick={save}>Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <OrderDemoDialog open={demoOrderOpen} onClose={() => setDemoOrderOpen(false)} />
      <PurchaseDemoDialog open={demoPurchaseOpen} onClose={() => setDemoPurchaseOpen(false)} />
    </div>
    </AppLayout>

  );
}

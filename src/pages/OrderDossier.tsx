import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { FulfillmentHeader } from "@/components/erp/FulfillmentHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Check, CircleDot } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { currentStage, STAGE_LABELS, STAGE_ORDER, type DossierStage } from "@/lib/orderDossier";

type Row = Record<string, any>;
type Event = { at: string; stage: DossierStage; title: string; detail?: string; href?: string };

const fmt = (d?: string | null) => (d ? format(new Date(d), "dd.MM.yyyy HH:mm") : "—");

export default function OrderDossier() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth() as any;
  const [order, setOrder] = useState<Row | null>(null);
  const [data, setData] = useState<{ offers: Row[]; deals: Row[]; pos: Row[]; prods: Row[]; dels: Row[]; invs: Row[]; handoffs: Row[]; depts: Row[] }>({ offers: [], deals: [], pos: [], prods: [], dels: [], invs: [], handoffs: [], depts: [] });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: o } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
    setOrder(o);
    if (!o) { setLoading(false); return; }
    const caseId = (o as Row).case_id as string | null;
    const none = Promise.resolve({ data: [] as Row[] });
    const [offers, deals, pos, prods, dels, invs, handoffs, depts] = await Promise.all([
      caseId ? supabase.from("offers").select("id, offer_no, status, total, sent_at, accepted_at, created_at, deal_id").eq("case_id", caseId) : none,
      caseId ? supabase.from("deals").select("id, deal_no, title, stage, won_at, created_at").eq("won_case_id", caseId) : none,
      caseId ? supabase.from("purchase_orders").select("id, po_no, status, ordered_at, expected_at, confirmed_delivery_date, created_at, updated_at").eq("case_id", caseId) : none,
      supabase.from("production_orders").select("id, wo_no, status, art_nr, quantity, created_at, completed_at").eq("order_id", id),
      supabase.from("deliveries").select("id, delivery_no, status, delivery_date, created_at, updated_at, tracking_no").eq("order_id", id),
      supabase.from("invoices").select("id, invoice_no, status, total_amount, invoice_date, created_at, payment_status").eq("order_id", id),
      supabase.from("order_handoffs").select("*").eq("order_id", id).order("created_at"),
      supabase.from("departments").select("id, name"),
    ]);
    setData({ offers: offers.data || [], deals: deals.data || [], pos: pos.data || [], prods: prods.data || [], dels: dels.data || [], invs: invs.data || [], handoffs: handoffs.data || [], depts: depts.data || [] });
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const stage = useMemo(() => order ? currentStage({
    orderStatus: order.status,
    purchaseStatuses: data.pos.map(p => String(p.status)),
    productionStatuses: data.prods.map(p => p.status),
    deliveryStatuses: data.dels.map(d => d.status),
    invoiceCount: data.invs.filter(i => !i.doc_kind || i.doc_kind === "invoice").length,
  }) : "vertrieb", [order, data]);

  const events = useMemo<Event[]>(() => {
    const ev: Event[] = [];
    data.deals.forEach(d => ev.push({ at: d.won_at || d.created_at, stage: "vertrieb", title: `Verkaufschance ${d.deal_no || ""} gewonnen`, detail: d.title, href: `/crm/deals/${d.id}` }));
    data.offers.forEach(o => ev.push({ at: o.accepted_at || o.sent_at || o.created_at, stage: "vertrieb", title: `Angebot ${o.offer_no}`, detail: o.status }));
    if (order) ev.push({ at: order.created_at, stage: "vertrieb", title: `Auftrag ${order.order_no} angelegt`, detail: order.customer_name });
    data.pos.forEach(p => ev.push({ at: p.created_at, stage: "einkauf", title: `Bestellung ${p.po_no}`, detail: `${p.status}${p.confirmed_delivery_date ? ` · bestätigt ${p.confirmed_delivery_date}` : ""}` }));
    data.prods.forEach(p => ev.push({ at: p.completed_at || p.created_at, stage: "werkstatt", title: `Werkstattauftrag ${p.wo_no}`, detail: `${p.status} · ${p.art_nr} × ${p.quantity}` }));
    data.dels.forEach(d => ev.push({ at: d.updated_at || d.created_at, stage: "versand", title: `Lieferschein ${d.delivery_no}`, detail: d.status === "shipped" ? "versendet" : d.status, href: "/lieferscheine" }));
    data.invs.forEach(i => ev.push({ at: i.created_at, stage: "rechnung", title: `Rechnung ${i.invoice_no}`, detail: `${Number(i.total_amount || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} € · ${i.payment_status || i.status}`, href: "/rechnungen" }));
    return ev.sort((a, b) => +new Date(a.at) - +new Date(b.at));
  }, [data, order]);

  const deptName = (d?: string) => data.depts.find(x => x.id === d)?.name || "—";
  const canWrite = !!user;

  const completeHandoff = async (h: Row) => {
    const { error } = await supabase.from("order_handoffs").update({ status: "done", completed_at: new Date().toISOString(), completed_by: user?.id, completed_reason: "Manuell erledigt" }).eq("id", h.id);
    if (error) return toast.error("Übergabe konnte nicht abgeschlossen werden");
    toast.success("Übergabe erledigt");
    load();
  };

  if (!loading && !order) return <AppLayout><div className="p-6 text-sm text-muted-foreground">Auftrag nicht gefunden.</div></AppLayout>;

  const idx = STAGE_ORDER.indexOf(stage);
  const openHandoffs = data.handoffs.filter(h => h.status === "open");

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <FulfillmentHeader
          title={`Vorgangsakte ${order?.order_no || ""}`}
          subtitle={`${order?.customer_name || "Kunde unbekannt"} · alle Schritte von Vertrieb bis Rechnung`}
          actions={<Button size="sm" variant="outline" onClick={() => navigate("/orders")}><ArrowLeft className="h-4 w-4" /> Aufträge</Button>}
        />

        <Card className="p-5">
          <p className="mb-4 text-[11px] font-medium text-muted-foreground">Aktueller Stand</p>
          <ol className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {STAGE_ORDER.map((s, i) => (
              <li key={s} className={`rounded-lg border p-3 ${i === idx ? "border-primary bg-primary/10" : i < idx ? "border-border bg-muted/30" : "border-border/50 opacity-60"}`}>
                <div className="flex items-center gap-2 text-xs font-medium">
                  {i < idx ? <Check className="h-3.5 w-3.5 text-primary" /> : <CircleDot className={`h-3.5 w-3.5 ${i === idx ? "text-primary" : "text-muted-foreground"}`} />}
                  {STAGE_LABELS[s]}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <p className="mb-4 text-[11px] font-medium text-muted-foreground">Verlauf</p>
            {events.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Einträge.</p> : (
              <ul className="space-y-3">
                {events.map((e, i) => (
                  <li key={i} className="flex gap-3 border-l-2 border-border pl-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[e.stage]}</Badge>
                        {e.href ? <Link to={e.href} className="text-sm font-medium hover:underline">{e.title}</Link> : <span className="text-sm font-medium">{e.title}</span>}
                      </div>
                      {e.detail && <p className="mt-0.5 text-xs text-muted-foreground">{e.detail}</p>}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Übergaben zwischen Bereichen</p>
            <p className="mb-4 text-xs text-muted-foreground">{openHandoffs.length} offen</p>
            {data.handoffs.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Übergaben. Sie entstehen automatisch, sobald der Auftrag aktiv ist.</p> : (
              <ul className="space-y-3">
                {data.handoffs.map(h => (
                  <li key={h.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{h.title}</span>
                      <Badge variant={h.status === "open" ? "default" : "outline"} className="text-[10px]">{h.status === "open" ? "Offen" : "Erledigt"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{STAGE_LABELS[h.stage as DossierStage]} · {deptName(h.department_id)}</p>
                    <p className="text-xs text-muted-foreground">Ausgelöst: {h.trigger_event} · {fmt(h.created_at)}</p>
                    {h.status === "done" && <p className="text-xs text-muted-foreground">Erledigt: {h.completed_reason} · {fmt(h.completed_at)}</p>}
                    {h.status === "open" && canWrite && <Button size="sm" variant="outline" className="mt-2" onClick={() => completeHandoff(h)}>Als erledigt markieren</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

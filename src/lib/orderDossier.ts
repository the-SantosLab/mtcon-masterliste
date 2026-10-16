export type DossierStage = "vertrieb" | "einkauf" | "werkstatt" | "versand" | "rechnung" | "abgeschlossen";

export const STAGE_LABELS: Record<DossierStage, string> = {
  vertrieb: "Vertrieb",
  einkauf: "Einkauf",
  werkstatt: "Werkstatt",
  versand: "Versand",
  rechnung: "Rechnung",
  abgeschlossen: "Abgeschlossen",
};

export interface DossierFacts {
  orderStatus: string;
  purchaseStatuses: string[];
  productionStatuses: string[];
  deliveryStatuses: string[];
  invoiceCount: number;
  openHandoffStages?: DossierStage[];
}

const closed = (s: string) => s === "received" || s === "cancelled";
const prodDone = (s: string) => s === "completed" || s === "cancelled";

/** Derives where an order currently stands in the sales → purchasing → workshop → shipping → invoicing chain. */
export function currentStage(f: DossierFacts): DossierStage {
  if (f.orderStatus === "draft") return "vertrieb";
  const pending = STAGE_ORDER.find(s => f.openHandoffStages?.includes(s));
  if (pending) return pending;
  if (f.invoiceCount > 0 || f.orderStatus === "invoiced") return "abgeschlossen";
  if (f.deliveryStatuses.includes("shipped") || f.orderStatus === "delivered") return "rechnung";
  if (f.purchaseStatuses.some((s) => !closed(s))) return "einkauf";
  if (f.productionStatuses.some((s) => !prodDone(s))) return "werkstatt";
  return "versand";
}

export const STAGE_ORDER: DossierStage[] = ["vertrieb", "einkauf", "werkstatt", "versand", "rechnung", "abgeschlossen"];

/** Existing CRM orders carry linkage markers even when no case was created. */
export function crmDossierLinks(notes?: string | null) {
  const uuid = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
  return {
    offerId: notes?.match(new RegExp(`offer:${uuid}`, "i"))?.[1] ?? null,
    dealId: notes?.match(new RegExp(`deal:${uuid}`, "i"))?.[1] ?? null,
  };
}

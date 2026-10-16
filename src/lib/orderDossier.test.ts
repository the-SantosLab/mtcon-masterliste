import { describe, expect, it } from "vitest";
import { crmDossierLinks, currentStage } from "./orderDossier";

const base = { orderStatus: "active", purchaseStatuses: [], productionStatuses: [], deliveryStatuses: [], invoiceCount: 0 };

describe("CRM dossier linkage", () => {
  it("finds the existing offer and deal markers without a case", () => {
    expect(crmDossierLinks("deal:11111111-1111-1111-1111-111111111111 offer:22222222-2222-2222-2222-222222222222")).toEqual({
      dealId: "11111111-1111-1111-1111-111111111111", offerId: "22222222-2222-2222-2222-222222222222",
    });
  });
  it("does not infer unrelated CRM links", () => expect(crmDossierLinks("ordinary order")).toEqual({ offerId: null, dealId: null }));
});

describe("currentStage", () => {
  it("active order awaiting material review remains in purchasing", () =>
    expect(currentStage({ ...base, openHandoffStages: ["einkauf"] })).toBe("einkauf"));
  it("pending workshop takes precedence over a partial shipped delivery", () =>
    expect(currentStage({ ...base, deliveryStatuses: ["shipped"], openHandoffStages: ["werkstatt", "rechnung"] })).toBe("werkstatt"));
  it("draft order stays in sales", () => expect(currentStage({ ...base, orderStatus: "draft" })).toBe("vertrieb"));
  it("open purchase order keeps order in purchasing", () =>
    expect(currentStage({ ...base, purchaseStatuses: ["received", "ordered"], productionStatuses: ["released"] })).toBe("einkauf"));
  it("all goods received with open workshop order moves to workshop", () =>
    expect(currentStage({ ...base, purchaseStatuses: ["received"], productionStatuses: ["issued"] })).toBe("werkstatt"));
  it("completed workshop moves to shipping", () =>
    expect(currentStage({ ...base, productionStatuses: ["completed"] })).toBe("versand"));
  it("shipped delivery moves to invoicing", () =>
    expect(currentStage({ ...base, deliveryStatuses: ["shipped"] })).toBe("rechnung"));
  it("invoice closes the dossier", () =>
    expect(currentStage({ ...base, deliveryStatuses: ["shipped"], invoiceCount: 1 })).toBe("abgeschlossen"));
});

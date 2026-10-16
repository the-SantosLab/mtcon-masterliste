import { describe, expect, it } from "vitest";
import { currentStage } from "./orderDossier";

const base = { orderStatus: "active", purchaseStatuses: [], productionStatuses: [], deliveryStatuses: [], invoiceCount: 0 };

describe("currentStage", () => {
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

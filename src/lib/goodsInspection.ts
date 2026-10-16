export type InspectionStatus = 'pending' | 'released' | 'defect' | 'stored' | 'defect_stored' | 'returned';

export const INSPECTION_STATUS: Record<InspectionStatus, string> = {
  pending: 'Am i-Punkt, ungeprüft', released: 'Freigegeben, einlagern', defect: 'Fehlerhaft am i-Punkt',
  stored: 'Eingelagert', defect_stored: 'Fehlerhaft eingelagert', returned: 'Zurückgesendet',
};

/** Arbeitsliste eines Prüfeintrags: prüfen → einlagern → (fehlerhaft bis Rücksendung) → erledigt. */
export function inspectionStage(s: InspectionStatus): 'check' | 'store' | 'defect' | 'done' {
  if (s === 'pending') return 'check';
  if (s === 'released') return 'store';
  if (s === 'defect' || s === 'defect_stored') return 'defect';
  return 'done';
}

/** Überlieferung: erfasste Menge über der offenen Restmenge. */
export function overDelivery(qty: number, open: number) {
  return Math.max(0, Math.round((qty - open) * 1000) / 1000);
}

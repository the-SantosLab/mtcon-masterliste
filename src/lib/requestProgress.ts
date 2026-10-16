export interface ProgressTask { department_id: string | null; status: string | null; completed?: boolean | null }
export interface DeptStep { department_id: string; done: number; total: number; state: 'done' | 'active' | 'open' }

const isDone = (t: ProgressTask) => t.status === 'done' || t.completed === true;

/** Fortschritt einer Anfrage 0–100 % aus erledigten Aufgaben; abgeschlossene Vorgänge zählen als 100 %. */
export function requestPercent(tasks: ProgressTask[], caseClosed = false): number {
  if (caseClosed) return 100;
  if (!tasks.length) return 0;
  return Math.round((tasks.filter(isDone).length / tasks.length) * 100);
}

/** Schritte je Abteilung in Reihenfolge des ersten Auftretens. */
export function departmentSteps(tasks: ProgressTask[]): DeptStep[] {
  const map = new Map<string, DeptStep>();
  for (const t of tasks) {
    if (!t.department_id) continue;
    const s = map.get(t.department_id) ?? { department_id: t.department_id, done: 0, total: 0, state: 'open' as const };
    s.total += 1; if (isDone(t)) s.done += 1;
    map.set(t.department_id, s);
  }
  return [...map.values()].map((s) => ({ ...s, state: s.done === s.total ? 'done' : s.done > 0 || tasks.some((t) => t.department_id === s.department_id && t.status === 'in_progress') ? 'active' : 'open' }));
}

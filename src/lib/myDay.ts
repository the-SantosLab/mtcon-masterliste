export type DayItem = {
  id: string; title: string; context: string; href: string;
  source: 'crm' | 'case' | 'erp' | 'handoff'; due: string | null; opened: string;
};

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dayOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDay(new Date(value));
}

export function dueToday(value: string | null, now: Date): boolean {
  return Boolean(value && dayOf(value) <= localDay(now));
}

export function personalHandoff(status: string, department: string | null, departments: string[], active: boolean, writer: boolean): boolean {
  return active && writer && status === 'open' && Boolean(department && departments.includes(department));
}

export function sortDayItems(items: DayItem[], now: Date): DayItem[] {
  const priority = (i: DayItem) => i.due && dayOf(i.due) < localDay(now) ? 0 : i.source === 'handoff' ? 2 : 1;
  return [...new Map(items.map(i => [i.id, i])).values()].sort((a, b) =>
    priority(a) - priority(b) || (a.due || a.opened).localeCompare(b.due || b.opened) || a.id.localeCompare(b.id));
}
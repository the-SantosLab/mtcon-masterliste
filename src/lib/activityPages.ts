import type { Tables } from '@/integrations/supabase/types';

/** crm_activities row; `type` is widened to string because follow-ups are stored beyond the base enum. */
export type Activity = Omit<Tables<'crm_activities'>, 'type'> & { type: string };
export type VisitReport = Tables<'crm_visit_reports'>;

/** Each sidebar point under "Kommunikation & Aufgaben" is backed by its own page. */
export const activityPages = [
  { key: 'tasks', title: 'Offene Aufgaben', short: 'Aufgaben', path: '/crm/kommunikation/aufgaben' },
  { key: 'followups', title: 'Wiedervorlagen', short: 'Wiedervorlagen', path: '/crm/kommunikation/wiedervorlagen' },
  { key: 'meetings', title: 'Termine', short: 'Termine', path: '/crm/kommunikation/termine' },
  { key: 'calls', title: 'Telefonate', short: 'Telefonate', path: '/crm/kommunikation/telefonate' },
  { key: 'emails', title: 'E-Mails', short: 'E-Mails', path: '/crm/kommunikation/emails' },
  { key: 'visits', title: 'Besuchsberichte', short: 'Besuche', path: '/crm/kommunikation/besuchsberichte' },
  { key: 'done', title: 'Erledigt', short: 'Erledigt', path: '/crm/kommunikation/erledigt' },
] as const;
export type ActivityPageKey = typeof activityPages[number]['key'];

const DAY = 86_400_000;
export const DUE_SOON_DAYS = 7;

export const typeLabel: Record<string, string> = {
  task: 'Aufgabe', call: 'Telefonat', email: 'E-Mail', meeting: 'Termin', note: 'Notiz', followup: 'Wiedervorlage',
};

export const isOpen = (a: Activity) => !a.completed_at;

/** Open and past its due date. */
export function isOverdue(a: Activity, now = Date.now()): boolean {
  return isOpen(a) && Boolean(a.due_at) && new Date(a.due_at!).getTime() < now;
}

/** Open and due within the next DUE_SOON_DAYS days (or already overdue). */
export function isDueSoon(a: Activity, now = Date.now(), days = DUE_SOON_DAYS): boolean {
  return isOpen(a) && Boolean(a.due_at) && new Date(a.due_at!).getTime() < now + days * DAY;
}

/** Follow-up = explicit followup type or an open task whose subject marks a Wiedervorlage. */
export function isFollowUp(a: Activity): boolean {
  return a.type === 'followup';
}

const byDueAsc = (a: Activity, b: Activity) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999');
const byCreatedDesc = (a: Activity, b: Activity) => b.created_at.localeCompare(a.created_at);

/** Which activities a sidebar page shows, and in which order. */
export function filterForPage(key: ActivityPageKey | null, acts: Activity[], now = Date.now()): Activity[] {
  switch (key) {
    case 'tasks':
      return acts.filter(a => a.type === 'task' && isOpen(a)).sort(byDueAsc);
    case 'followups':
      return acts.filter(a => isFollowUp(a) && isOpen(a)).sort(byDueAsc);
    case 'meetings':
      return acts.filter(a => a.type === 'meeting' && isOpen(a)).sort(byDueAsc);
    case 'calls':
      return acts.filter(a => a.type === 'call').sort(byCreatedDesc);
    case 'emails':
      return acts.filter(a => a.type === 'email').sort(byCreatedDesc);
    case 'done':
      return acts.filter(a => !isOpen(a)).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    default:
      return [...acts].sort(byCreatedDesc);
  }
}

/** Overview counters shown on the workspace start page. */
export function overviewStats(acts: Activity[], now = Date.now()) {
  const openActs = acts.filter(isOpen);
  return {
    total: acts.length,
    open: openActs.length,
    overdue: acts.filter(a => isOverdue(a, now)).length,
    dueSoon: acts.filter(a => isDueSoon(a, now)).length,
    unassigned: openActs.filter(a => !a.owner_id).length,
  };
}

export function groupByType(acts: Activity[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const a of acts) m.set(a.type, (m.get(a.type) ?? 0) + 1);
  return [...m].map(([t, count]) => ({ name: typeLabel[t] ?? t, count })).sort((a, b) => b.count - a.count);
}

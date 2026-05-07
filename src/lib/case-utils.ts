import type { Enums } from '@/integrations/supabase/types';

type CaseStatus = Enums<'case_status'>;

/**
 * Smart Department Fallback (Mario-Logik):
 * - department_id explizit gesetzt → diese Abteilung
 * - department_id NULL → Abteilung des Erstellers (silent fallback, NICHT in DB schreiben)
 * - Ersteller ohne Abteilung → bleibt "Keine Abteilung"
 *
 * Reine Query-Time-Ableitung. Niemals zurückschreiben.
 */
export type DeptResolverItem = { department_id: string | null; created_by?: string | null };

export function resolveEffectiveDeptId(
  item: DeptResolverItem,
  creatorDeptMap: Record<string, string | null | undefined>,
): { effectiveId: string | null; isFallback: boolean } {
  if (item.department_id) return { effectiveId: item.department_id, isFallback: false };
  const fallback = item.created_by ? creatorDeptMap[item.created_by] ?? null : null;
  return { effectiveId: fallback, isFallback: !!fallback };
}

/** Prüft, ob ein Vorgang in einer Abteilungs-Auswahl (inkl. Kinder) erscheint, mit Fallback. */
export function caseMatchesDept(
  item: DeptResolverItem,
  selectedDeptId: string,
  childIds: string[],
  creatorDeptMap: Record<string, string | null | undefined>,
): boolean {
  const { effectiveId } = resolveEffectiveDeptId(item, creatorDeptMap);
  if (!effectiveId) return false;
  return effectiveId === selectedDeptId || childIds.includes(effectiveId);
}


export const STATUS_LABELS: Record<CaseStatus, string> = {
  nicht_begonnen: 'Nicht begonnen',
  in_planung: 'In Planung',
  in_arbeit: 'In Arbeit',
  in_verzug: 'In Verzug',
  abgeschlossen: 'Abgeschlossen',
  ready_for_review: 'Zur Prüfung',
  blocked: 'Blockiert',
  verworfen: 'Verworfen',
  archiv: 'Archiv',
};

export const STATUS_DOT_COLORS: Record<CaseStatus, string> = {
  nicht_begonnen: 'bg-[hsl(var(--status-open))]',
  in_planung: 'bg-[hsl(var(--status-planning))]',
  in_arbeit: 'bg-[hsl(var(--status-working))]',
  in_verzug: 'bg-[hsl(var(--status-overdue))]',
  abgeschlossen: 'bg-[hsl(var(--status-done))]',
  ready_for_review: 'bg-[hsl(var(--chart-4))]',
  blocked: 'bg-destructive',
  verworfen: 'bg-[hsl(var(--status-rejected))]',
  archiv: 'bg-[hsl(var(--status-archive))]',
};

// Keep for backward compat but unused in new design
export const STATUS_VARIANTS: Record<CaseStatus, string> = {
  nicht_begonnen: 'bg-status-open',
  in_planung: 'bg-status-planning',
  in_arbeit: 'bg-status-working',
  in_verzug: 'bg-status-overdue',
  abgeschlossen: 'bg-status-done',
  ready_for_review: 'bg-chart-4',
  blocked: 'bg-destructive',
  verworfen: 'bg-status-rejected',
  archiv: 'bg-status-archive',
};

export const ACTION_LABELS: Record<string, string> = {
  CLAIM: 'Vorgang abgeholt',
  UNCLAIM: 'Vorgang freigegeben',
  STATUS_CHANGE: 'Status geändert',
  DEPT_MOVE: 'Abteilung geändert',
  EDIT: 'Bearbeitet',
  COMMENT: 'Kommentar',
  CLOSE: 'Abgeschlossen',
  CREATE: 'Erstellt',
  updated: 'Bearbeitet',
  deleted: 'Gelöscht',
  task_created: 'Unteraufgabe angelegt',
  task_updated: 'Unteraufgabe geändert',
  task_deleted: 'Unteraufgabe gelöscht',
  auto_forward: 'Automatisch weitergeleitet',
  note_created: 'Notiz hinzugefügt',
  note_updated: 'Notiz bearbeitet',
  note_deleted: 'Notiz gelöscht',
};

export const FIELD_LABELS: Record<string, string> = {
  due_at: 'Fälligkeit',
  project_name: 'Projektname',
  note: 'Notiz',
  estimated_hours: 'Geschätzte Stunden',
  client_name: 'Kunde',
  customer_no: 'Kunden-Nr.',
  project_article_no: 'Artikel-Nr.',
  quantity: 'Menge',
  sop: 'SOP',
  received_at: 'Eingangsdatum',
  status: 'Status',
  department_id: 'Abteilung',
  assigned_to: 'Zuständig',
  title: 'Titel',
};

export const isTerminalStatus = (status: CaseStatus) =>
  ['abgeschlossen', 'verworfen', 'archiv'].includes(status);

export const canClaim = (status: CaseStatus, assigneeId: string | null) =>
  !assigneeId && !isTerminalStatus(status);

export const formatDate = (date: string | null) => {
  if (!date) return '–';
  return new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTime = (date: string | null) => {
  if (!date) return '–';
  return new Date(date).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

export const formatRelativeTime = (date: string) => {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'gerade eben';
  if (diffMins < 60) return `vor ${diffMins} Min.`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `vor ${diffDays} Tag${diffDays > 1 ? 'en' : ''}`;
  return formatDate(date);
};

// ── Department types (moved from ticket-types.ts) ──

export interface Department {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
  manager_user_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[];
  case_count?: number;
  head_name?: string;
}

export function buildTree(departments: Department[]): DepartmentNode[] {
  const map = new Map<string, DepartmentNode>();
  const roots: DepartmentNode[] = [];

  departments.forEach(d => map.set(d.id, { ...d, children: [] }));
  departments.forEach(d => {
    const node = map.get(d.id)!;
    if (d.parent_id && map.has(d.parent_id)) {
      map.get(d.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes: DepartmentNode[]) => {
    nodes.sort((a, b) => a.sort_order - b.sort_order);
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

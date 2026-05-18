import { useEffect, useState } from 'react';
import { ChevronDown, Mail, Bell, Info, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationLog, formatLastSent } from '@/hooks/useNotificationLog';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';

interface Props {
  caseId: string;
  refreshKey?: number;
}

const RULES: Array<{ type: string; title: string; trigger: string; recipients: string }> = [
  {
    type: 'vorgang_created',
    title: 'Vorgang angelegt',
    trigger: 'Neuer Vorgang wird erstellt',
    recipients: 'Bearbeiter (falls gesetzt) – sonst alle Mitglieder der Ziel-Abteilung (außer Akteur)',
  },
  {
    type: 'task_created',
    title: 'Unteraufgabe angelegt',
    trigger: 'Neue Unteraufgabe wird zum Vorgang erstellt',
    recipients: 'Ersteller, Bearbeiter und Watcher des Vorgangs (außer Akteur)',
  },
  {
    type: 'task_assigned',
    title: 'Unteraufgabe zugewiesen',
    trigger: 'Bearbeiter einer Unteraufgabe wird gesetzt',
    recipients: 'Neuer Bearbeiter (außer wenn Selbstzuweisung)',
  },
  {
    type: 'task_abgeschlossen',
    title: 'Unteraufgabe abgeschlossen',
    trigger: 'Eine Unteraufgabe wird auf „Erledigt" gesetzt',
    recipients: 'Alle Watcher des Vorgangs (außer Akteur)',
  },
  {
    type: 'abgeholt',
    title: 'Vorgang abgeholt',
    trigger: 'Vorgang wechselt erstmalig auf „In Arbeit"',
    recipients: 'Ersteller des Vorgangs (außer Selbstabholung)',
  },
  {
    type: 'vorgang_abgeschlossen',
    title: 'Vorgang abgeschlossen',
    trigger: 'Vorgang wird komplett geschlossen',
    recipients: 'Ersteller, Bearbeiter und Watcher (außer Akteur)',
  },
  {
    type: 'status_change',
    title: 'In-App-Benachrichtigung Status',
    trigger: 'Statuswechsel des Vorgangs',
    recipients: 'Ersteller und Bearbeiter (nur In-App, keine E-Mail)',
  },
];

const TYPE_LABELS: Record<string, string> = {
  vorgang_created: 'Vorgang angelegt',
  task_created: 'Aufgabe angelegt',
  task_assigned: 'Aufgabe zugewiesen',
  task_abgeschlossen: 'Aufgabe erledigt',
  abgeholt: 'Vorgang abgeholt',
  vorgang_abgeschlossen: 'Vorgang abgeschlossen',
  due_reminder: 'Endtermin-Erinnerung',
};

interface Profile {
  id: string;
  display_name: string;
  short_code: string;
  active: boolean;
  avatar_url: string | null;
  department_id: string | null;
}

interface Participant {
  user: Profile;
  roles: string[];
  permission: string;
  departmentName: string | null;
}

export function NotificationCockpit({ caseId, refreshKey = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const { lastByType, recent, loading } = useNotificationLog(caseId, refreshKey);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [partLoading, setPartLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPartLoading(true);
      // 1. Load case with watchers/creator/assignee/department
      const { data: c } = await supabase
        .from('cases')
        .select('id, created_by, assignee_id, watchers, department_id')
        .eq('id', caseId)
        .maybeSingle();
      if (!c || cancelled) return;

      // 2. Load subtasks (case_tasks) assignees
      const { data: tasks } = await supabase
        .from('case_tasks')
        .select('assigned_to, department_id')
        .eq('case_id', caseId);

      // Collect role assignments per user id
      const rolesMap = new Map<string, { roles: Set<string>; deptIds: Set<string> }>();
      const add = (id: string | null | undefined, role: string, deptId?: string | null) => {
        if (!id) return;
        const cur = rolesMap.get(id) || { roles: new Set(), deptIds: new Set() };
        cur.roles.add(role);
        if (deptId) cur.deptIds.add(deptId);
        rolesMap.set(id, cur);
      };
      add(c.created_by as string, 'Ersteller', c.department_id as string | null);
      add(c.assignee_id as string, 'Bearbeiter', c.department_id as string | null);
      ((c.watchers as string[]) || []).forEach((w) => add(w, 'Watcher'));
      (tasks || []).forEach((t: any) => add(t.assigned_to, 'Verantw. Untervorgang', t.department_id));

      const userIds = Array.from(rolesMap.keys());
      if (userIds.length === 0) {
        if (!cancelled) {
          setParticipants([]);
          setPartLoading(false);
        }
        return;
      }

      const { data: profiles } = await supabase
        .from('users_profile')
        .select('id, display_name, short_code, active, avatar_url, department_id')
        .in('id', userIds);

      const deptIds = Array.from(
        new Set([
          ...(profiles || []).map((p: any) => p.department_id).filter(Boolean),
          ...Array.from(rolesMap.values()).flatMap((v) => Array.from(v.deptIds)),
        ]),
      );
      const { data: depts } = deptIds.length
        ? await supabase.from('departments').select('id, name').in('id', deptIds)
        : { data: [] as any[] };
      const deptName = new Map<string, string>((depts || []).map((d: any) => [d.id, d.name]));

      // Read perms: from department_permissions for the case department (best-effort)
      const result: Participant[] = (profiles || []).map((p: any) => {
        const meta = rolesMap.get(p.id)!;
        const roles = Array.from(meta.roles);
        const isCreator = roles.includes('Ersteller');
        const isAssignee = roles.includes('Bearbeiter');
        const permission = isAssignee
          ? 'Verantwortlicher'
          : isCreator || roles.includes('Verantw. Untervorgang')
            ? 'Schreiben'
            : 'Lesen';
        return {
          user: p as Profile,
          roles,
          permission,
          departmentName: p.department_id ? deptName.get(p.department_id) || null : null,
        };
      });

      // Stable sort: Ersteller → Bearbeiter → Watcher → Untervorgang
      const order = ['Ersteller', 'Bearbeiter', 'Verantw. Untervorgang', 'Watcher'];
      result.sort((a, b) => {
        const ra = Math.min(...a.roles.map((r) => order.indexOf(r) === -1 ? 99 : order.indexOf(r)));
        const rb = Math.min(...b.roles.map((r) => order.indexOf(r) === -1 ? 99 : order.indexOf(r)));
        return ra - rb;
      });

      if (!cancelled) {
        setParticipants(result);
        setPartLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [caseId, refreshKey]);

  const totalSent = recent.length;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Benachrichtigungs-Cockpit &amp; Teilnehmerübersicht
          </h3>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            {participants.length} Teilnehmer · {totalSent > 0 ? `${totalSent} Versand-Einträge` : 'Noch kein Versand'}
          </span>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/60">
          {/* Participants section */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Users className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Teilnehmer &amp; Berechtigungen
              </p>
            </div>
            {partLoading ? (
              <p className="text-[11px] text-muted-foreground">Lade…</p>
            ) : participants.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Keine Teilnehmer.</p>
            ) : (
              <div className="rounded-md border border-border/60 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-muted/30 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  <div className="col-span-4">Name</div>
                  <div className="col-span-3">Rolle</div>
                  <div className="col-span-2">Abteilung</div>
                  <div className="col-span-2">Berechtigung</div>
                  <div className="col-span-1 text-right">Status</div>
                </div>
                <div className="divide-y divide-border/60">
                  {participants.map((p) => (
                    <div key={p.user.id} className="grid grid-cols-12 gap-2 px-3 py-1.5 items-center text-[11px]">
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <UserAvatar user={p.user} size="sm" tooltip={false} />
                        <div className="min-w-0">
                          <p className="text-foreground font-medium truncate leading-tight">{p.user.display_name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{p.user.short_code}</p>
                        </div>
                      </div>
                      <div className="col-span-3 text-muted-foreground">{p.roles.join(', ')}</div>
                      <div className="col-span-2 text-muted-foreground truncate">{p.departmentName || '–'}</div>
                      <div className="col-span-2 text-muted-foreground">{p.permission}</div>
                      <div className="col-span-1 text-right">
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px]',
                          p.user.active ? 'text-foreground' : 'text-muted-foreground',
                        )}>
                          <span className={cn('h-1.5 w-1.5 rounded-full', p.user.active ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                          {p.user.active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <p>
              Übersicht aller automatisch ausgelösten Benachrichtigungen für diesen Vorgang.
              Bei jeder Aktion lässt sich der Versand bewusst über die Checkbox abschalten.
            </p>
          </div>

          {/* Rules */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Auslöser & Empfänger</p>
            <div className="rounded-md border border-border/60 divide-y divide-border/60">
              {RULES.map((r) => {
                const last = formatLastSent(lastByType[r.type]);
                return (
                  <div key={r.type} className="grid grid-cols-1 sm:grid-cols-12 gap-2 px-3 py-2 text-[11px]">
                    <div className="sm:col-span-3 font-medium text-foreground">{r.title}</div>
                    <div className="sm:col-span-4 text-muted-foreground">{r.trigger}</div>
                    <div className="sm:col-span-3 text-muted-foreground">{r.recipients}</div>
                    <div className="sm:col-span-2 text-right text-muted-foreground tabular-nums">
                      {last ? `Zuletzt: ${last}` : '–'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent log */}
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              Letzte Versendungen
            </p>
            {loading ? (
              <p className="text-[11px] text-muted-foreground">Lade…</p>
            ) : recent.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Bisher wurden keine E-Mails zu diesem Vorgang versendet.</p>
            ) : (
              <div className="rounded-md border border-border/60 max-h-48 overflow-y-auto divide-y divide-border/60">
                {recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground shrink-0">
                      {TYPE_LABELS[r.type] || r.type}
                    </span>
                    <span className="text-muted-foreground truncate flex-1">{r.recipient_email}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {formatLastSent(r.sent_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

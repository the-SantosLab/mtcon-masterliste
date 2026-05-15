import { useState } from 'react';
import { ChevronDown, Mail, Bell, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotificationLog, formatLastSent } from '@/hooks/useNotificationLog';

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

export function NotificationCockpit({ caseId, refreshKey = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const { lastByType, recent, loading } = useNotificationLog(caseId, refreshKey);

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
            Benachrichtigungen – Cockpit
          </h3>
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            {totalSent > 0 ? `${totalSent} Versand-Einträge` : 'Noch kein Versand'}
          </span>
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border/60">
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

import { Checkbox } from '@/components/ui/checkbox';
import { Mail, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatLastSent } from '@/hooks/useNotificationLog';

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** ISO timestamp of last send for this notification type (optional). */
  lastSentAt?: string | null;
  /** Short label, e.g. "an Bearbeiter & Watcher". */
  recipientsHint?: string;
  /** Override main label. */
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Inline control to enable/disable an automatic email notification for a single action,
 * with a small "zuletzt gesendet" hint underneath for traceability.
 */
export function NotifyToggle({
  checked,
  onChange,
  lastSentAt,
  recipientsHint,
  label = 'E-Mail-Benachrichtigung senden',
  className,
  disabled,
}: Props) {
  const last = formatLastSent(lastSentAt);
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <label className="inline-flex items-center gap-2 text-[11px] text-foreground cursor-pointer select-none">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onChange(v === true)}
          disabled={disabled}
          className="h-3.5 w-3.5"
        />
        <Mail className="h-3 w-3 text-muted-foreground" />
        <span>{label}</span>
        {recipientsHint && (
          <span className="text-muted-foreground">({recipientsHint})</span>
        )}
      </label>
      {last ? (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground pl-[22px]">
          <Clock className="h-2.5 w-2.5" />
          Zuletzt gesendet: {last}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground pl-[22px]">Bisher kein Versand protokolliert</span>
      )}
    </div>
  );
}

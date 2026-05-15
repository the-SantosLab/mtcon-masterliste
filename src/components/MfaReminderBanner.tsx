import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert, ArrowRight } from 'lucide-react';

const DEADLINE = new Date('2026-05-22T23:59:59');

export function MfaReminderBanner() {
  const { session } = useAuth();
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    if (!session) { setNeedsMfa(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = data?.totp?.find(f => f.status === 'verified');
      setNeedsMfa(!verified);
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (!needsMfa) return null;

  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((DEADLINE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const overdue = now > DEADLINE;

  return (
    <div className={`mb-4 rounded-md border p-3 flex items-start gap-3 ${
      overdue
        ? 'border-destructive/40 bg-destructive/10'
        : 'border-amber-500/40 bg-amber-500/10'
    }`}>
      <ShieldAlert className={`h-4 w-4 mt-0.5 shrink-0 ${overdue ? 'text-destructive' : 'text-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground">
          Zwei-Faktor-Authentifizierung erforderlich
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
          {overdue ? (
            <>Die Frist zur Einrichtung der 2FA ist abgelaufen. Ohne aktive 2FA ist eine Arbeit im System nicht mehr möglich. Bitte richten Sie 2FA umgehend ein.</>
          ) : (
            <>Bis <span className="font-medium text-foreground">Freitag, 22. Mai 2026</span> muss die Zwei-Faktor-Authentifizierung aktiviert sein. Andernfalls ist ein Login bzw. Arbeiten im System ab diesem Datum nicht mehr möglich. {daysLeft > 0 && <span className="text-foreground">Noch {daysLeft} Tag{daysLeft === 1 ? '' : 'e'}.</span>}</>
          )}
        </p>
        <div className="flex gap-2 mt-2">
          <Link
            to="/profile"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
          >
            Jetzt einrichten <ArrowRight className="h-3 w-3" />
          </Link>
          <span className="text-[11px] text-muted-foreground">·</span>
          <Link
            to="/2fa-anleitung"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
          >
            Anleitung öffnen
          </Link>
        </div>
      </div>
    </div>
  );
}

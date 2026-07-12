import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const DEADLINE = new Date('2026-05-22T23:59:59');
const DISMISS_KEY = 'mfa-reminder-dismissed-session';

export function MfaReminderBanner() {
  // 2FA-Enforcement projektweit deaktiviert – kein Banner mehr.
  return null;
}

function _MfaReminderBannerDisabled() {

  const { session } = useAuth();
  const [needsMfa, setNeedsMfa] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!session) { setNeedsMfa(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = data?.totp?.find(f => f.status === 'verified');
      const missing = !verified;
      setNeedsMfa(missing);
      if (missing) {
        const dismissedFor = sessionStorage.getItem(DISMISS_KEY);
        if (dismissedFor !== session.user.id) {
          setDialogOpen(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const dismissDialog = () => {
    if (session) sessionStorage.setItem(DISMISS_KEY, session.user.id);
    setDialogOpen(false);
  };

  if (!needsMfa) return null;

  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((DEADLINE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const overdue = now > DEADLINE;

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) dismissDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className={`mx-auto mb-3 h-12 w-12 rounded-full flex items-center justify-center ${
              overdue ? 'bg-destructive/15' : 'bg-amber-500/15'
            }`}>
              <ShieldAlert className={`h-6 w-6 ${overdue ? 'text-destructive' : 'text-amber-500'}`} />
            </div>
            <DialogTitle className="text-center text-base font-semibold">
              Zwei-Faktor-Authentifizierung erforderlich
            </DialogTitle>
            <DialogDescription className="text-center text-xs leading-relaxed pt-2">
              {overdue ? (
                <>Die Frist zur Einrichtung der 2FA ist <span className="text-destructive font-medium">abgelaufen</span>. Ohne aktive 2FA ist eine Arbeit im System nicht mehr gestattet. Bitte richten Sie 2FA umgehend ein.</>
              ) : (
                <>Bis <span className="font-semibold text-foreground">Freitag, 22. Mai 2026</span> muss die Zwei-Faktor-Authentifizierung für Ihr Konto aktiviert sein. Andernfalls ist ab diesem Datum kein Login bzw. Arbeiten im System mehr möglich.{daysLeft > 0 && <> Es verbleiben noch <span className="font-semibold text-foreground">{daysLeft} Tag{daysLeft === 1 ? '' : 'e'}</span>.</>}</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-medium text-foreground">In wenigen Schritten aktiviert:</p>
            <ol className="text-[11px] text-muted-foreground space-y-1 list-decimal list-inside leading-relaxed">
              <li>Authenticator-App auf dem Smartphone installieren</li>
              <li>Im Profil unter „Sicherheit" 2FA aktivieren</li>
              <li>QR-Code mit der App scannen</li>
              <li>6-stelligen Code zur Bestätigung eingeben</li>
            </ol>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" onClick={dismissDialog} className="h-8 text-xs">
              Später erinnern
            </Button>
            <Link to="/2fa-anleitung" onClick={dismissDialog}>
              <Button size="sm" className="h-8 text-xs gap-1">
                Jetzt einrichten <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              to="/2fa-anleitung"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
            >
              Jetzt einrichten <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

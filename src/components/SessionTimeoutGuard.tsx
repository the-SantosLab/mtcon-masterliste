import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { useSessionEnforcement } from '@/hooks/useSessionEnforcement';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { isSessionPolicyExemptEmail } from '@/lib/authExemptions';

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SessionTimeoutGuard() {
  const { session, user } = useAuth();
  const location = useLocation();
  const isAuthFlow = location.pathname === '/auth' || location.pathname === '/reset-password' || location.pathname === '/mfa-challenge';
  // Single-Session-Enforcement deaktiviert für js@santoslab.de (Dev-Account).
  const enforcementExempt = isSessionPolicyExemptEmail(user?.email);
  const { warningOpen, remainingMs, stayLoggedIn, logoutNow } = useSessionTimeout(!!session);
  useSessionEnforcement(!!session && !isAuthFlow && !enforcementExempt, user?.id);

  return (
    <Dialog open={warningOpen} onOpenChange={(o) => { if (!o) stayLoggedIn(); }} modal={false}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sitzung läuft ab</DialogTitle>
          <DialogDescription>
            Du wirst in 15 Minuten automatisch ausgeloggt.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2 text-center">
          <div className="text-2xl font-mono tabular-nums text-foreground">Noch {formatMs(remainingMs)} Minuten</div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={logoutNow}>Jetzt ausloggen</Button>
          <Button onClick={stayLoggedIn}>Angemeldet bleiben</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

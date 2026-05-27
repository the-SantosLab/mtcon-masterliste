import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import mtconLogo from '@/assets/mtcon_logo.png';

export default function MfaChallenge() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needsMfa, setNeedsMfa] = useState<boolean | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!session || ranRef.current) return;
    ranRef.current = true;
    (async () => {
      // 2FA-Enforcement deaktiviert für Dev-/Ausnahme-Accounts.
      if (session.user?.email === 'js@santoslab.de' || session.user?.email === 'nathalie.kress@mtcon.eu') {
        setNeedsMfa(false);
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === 'aal2' || aal?.nextLevel !== 'aal2') {
        setNeedsMfa(false);
        return;
      }
      // Try listFactors with a retry — right after sign-in the factor list
      // can occasionally come back empty even though a verified factor exists.
      const findVerified = async () => {
        const { data: f } = await supabase.auth.mfa.listFactors();
        // Use both `totp` and `all` since SDK versions differ
        const fromTotp = f?.totp?.find(x => x.status === 'verified' && x.factor_type === 'totp');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fromAll = (f as any)?.all?.find?.((x: any) => x.status === 'verified' && x.factor_type === 'totp');
        return fromTotp || fromAll || null;
      };
      let verified = await findVerified();
      if (!verified) {
        await new Promise(r => setTimeout(r, 600));
        verified = await findVerified();
      }
      if (!verified) {
        // AAL says aal2 is required, which only happens when a verified factor exists.
        // Don't bounce the user to the setup guide — surface the issue and let them retry.
        setNeedsMfa(false);
        toast.error('2FA-Faktor konnte nicht geladen werden. Bitte Seite neu laden.');
        return;
      }
      setFactorId(verified.id);
      setNeedsMfa(true);
    })();
  }, [session, navigate]);

  if (signedOut) return <Navigate to="/auth" replace />;
  if (loading || needsMfa === null) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Laden</p></div>;
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!needsMfa) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setSubmitting(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setSubmitting(false);
    if (error) { toast.error(error.message || 'Code ungültig'); return; }
    toast.success('Erfolgreich angemeldet');
    navigate('/', { replace: true });
  };

  const cancel = async () => {
    await signOut();
    setSignedOut(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background glass-bg p-4">
      <div className="w-full max-w-sm relative z-[1]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-14 w-14 flex items-center justify-center">
            <img src={mtconLogo} alt="MTCON Logo" className="h-14 w-14 object-contain" />
          </div>
          <h1 className="text-base font-semibold text-foreground">Zwei-Faktor-Authentifizierung</h1>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-foreground">Code aus Authenticator-App eingeben</h2>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mfa-code" className="text-xs font-medium text-muted-foreground">6-stelliger Code</Label>
              <Input
                id="mfa-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                className="h-9 text-base font-mono tracking-widest text-center"
              />
            </div>
            <Button type="submit" className="w-full h-9 text-xs" disabled={submitting || code.length !== 6}>
              {submitting ? 'Prüfe…' : 'Bestätigen'}
            </Button>
            <button type="button" onClick={cancel} className="w-full text-[11px] text-muted-foreground hover:text-foreground">
              Abmelden
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

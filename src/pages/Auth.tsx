import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { getLocalSessionToken, isCurrentTabSessionBlocked, setLocalSessionToken } from '@/hooks/useSessionEnforcement';
import { clearStoredAuthRedirect, getRedirectParam, getStoredAuthRedirect } from '@/lib/authRedirect';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import mtconLogo from '@/assets/mtcon_logo.png';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Mindestens 6 Zeichen'),
});

type View = 'login' | 'forgot';

export default function Auth() {
  const { session, loading, signIn } = useAuth();
  const location = useLocation();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmTakeover, setConfirmTakeover] = useState<{ userId: string } | null>(null);

  const isBlockedSession = isCurrentTabSessionBlocked();
  const hasTabSessionToken = !!getLocalSessionToken();

  // Ziel-URL nach erfolgreichem Login (z. B. via E-Mail-Deeplink)
  const fromState = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
  const redirectTarget = fromState?.pathname
    ? `${fromState.pathname}${fromState.search ?? ''}${fromState.hash ?? ''}`
    : getRedirectParam(location.search) ?? getStoredAuthRedirect();

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Laden</p></div>;
  if (session && hasTabSessionToken && !confirmTakeover && !isBlockedSession) {
    const mod = typeof window !== 'undefined' ? localStorage.getItem('mtcon.module') : null;
    const isCrmBeta = session.user?.email === 'js@santoslab.de';
    if (redirectTarget && redirectTarget !== '/auth') {
      clearStoredAuthRedirect();
      return <Navigate to={redirectTarget} replace />;
    }
    if (!isCrmBeta) {
      localStorage.removeItem('mtcon.module');
      return <Navigate to="/" replace />;
    }
    return <Navigate to={mod === 'crm' ? '/crm/dashboard' : mod === 'ops' ? '/' : '/modules'} replace />;
  }

  const writeToken = async (userId: string) => {
    const token = crypto.randomUUID();
    const { error } = await supabase.from('users_profile').update({ active_session_token: token }).eq('id', userId);
    if (error) throw error;
    setLocalSessionToken(token);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (view === 'login') {
        loginSchema.parse({ email, password });
        const { error } = await signIn(email, password);
        if (error) {
          toast.error(error.message.includes('Invalid login') ? 'Ungültige E-Mail oder Passwort' : error.message);
          return;
        }
        const { data: u } = await supabase.auth.getUser();
        const userId = u.user?.id;
        if (!userId) return;
        const { data: prof } = await supabase
          .from('users_profile').select('active_session_token').eq('id', userId).maybeSingle();
        const existing = prof?.active_session_token;
        if (existing) {
          setConfirmTakeover({ userId });
          return;
        }
        await writeToken(userId);
      } else {
        if (!email) { toast.error('Bitte E-Mail eingeben'); setSubmitting(false); return; }
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toast.error(json.error || 'Fehler beim Senden');
        } else {
          toast.success('Passwort-Reset-E-Mail wurde gesendet. Bitte prüfe dein Postfach.');
          setView('login');
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
    } finally {
      setSubmitting(false);
    }
  };

  const confirmTakeoverYes = async () => {
    if (!confirmTakeover) return;
    try {
      await writeToken(confirmTakeover.userId);
      setConfirmTakeover(null);
    } catch (e: unknown) {
      toast.error('Fehler beim Anmelden: ' + (e instanceof Error ? e.message : ''));
    }
  };

  const confirmTakeoverNo = async () => {
    setConfirmTakeover(null);
    setLocalSessionToken(null);
    if (!isBlockedSession) await supabase.auth.signOut();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background glass-bg p-4">
      <div className="w-full max-w-sm relative z-[1]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-14 w-14 flex items-center justify-center">
            <img src={mtconLogo} alt="MTCON Logo" className="h-14 w-14 object-contain" />
          </div>
          <h1 className="text-base font-semibold text-foreground">Masterliste</h1>
        </div>

        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">
            {view === 'login' ? 'Anmeldung' : 'Passwort zurücksetzen'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-Mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firma.de" required />
            </div>

            {view === 'login' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Passwort</Label>
                  <button type="button" onClick={() => setView('forgot')} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                    Passwort vergessen?
                  </button>
                </div>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort eingeben" required />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Bitte warten…' : view === 'login' ? 'Anmelden' : 'Link anfordern'}
            </Button>
          </form>

          {view === 'forgot' && (
            <div className="mt-4 text-center">
              <button type="button" onClick={() => setView('login')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Zurück zur Anmeldung
              </button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!confirmTakeover}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bereits angemeldet</AlertDialogTitle>
            <AlertDialogDescription>
              Du bist bereits in einem anderen Browser angemeldet. Möchtest du diese Sitzung beenden und hier fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={confirmTakeoverNo}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTakeoverYes}>Ja, hier anmelden</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

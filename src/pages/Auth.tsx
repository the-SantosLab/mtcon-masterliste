import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';
import mtconLogo from '@/assets/mtcon_logo.png';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Mindestens 6 Zeichen'),
});
const signupSchema = loginSchema.extend({
  displayName: z.string().min(2, 'Mindestens 2 Zeichen'),
  shortCode: z.string().min(2, 'Mindestens 2 Zeichen'),
});

type View = 'login' | 'register' | 'forgot';

export default function Auth() {
  const { session, loading, signIn, signUp } = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Laden</p></div>;
  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (view === 'login') {
        loginSchema.parse({ email, password });
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message.includes('Invalid login') ? 'Ungültige E-Mail oder Passwort' : error.message);
      } else if (view === 'register') {
        signupSchema.parse({ email, password, displayName, shortCode });
        const { error } = await signUp(email, password, displayName, shortCode);
        if (error) toast.error(error.message.includes('already registered') ? 'E-Mail bereits registriert' : error.message);
        else toast.success('Registrierung erfolgreich');
      } else if (view === 'forgot') {
        if (!email) { toast.error('Bitte E-Mail eingeben'); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) toast.error(error.message);
        else {
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

  const titles: Record<View, string> = { login: 'Anmeldung', register: 'Registrierung', forgot: 'Passwort zurücksetzen' };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-14 w-14 flex items-center justify-center">
            <img src={mtconLogo} alt="MTCON Logo" className="h-14 w-14 object-contain" />
          </div>
          <h1 className="text-base font-semibold text-foreground">KS Command Light</h1>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-5">{titles[view]}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-Mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firma.de" required />
            </div>

            {view !== 'forgot' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Passwort</Label>
                  {view === 'login' && (
                    <button type="button" onClick={() => setView('forgot')} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                      Passwort vergessen?
                    </button>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Passwort eingeben" required />
              </div>
            )}

            {view === 'register' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="displayName" className="text-xs font-medium text-muted-foreground">Anzeigename</Label>
                  <Input id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Max Mustermann" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shortCode" className="text-xs font-medium text-muted-foreground">Kürzel</Label>
                  <Input id="shortCode" value={shortCode} onChange={e => setShortCode(e.target.value)} placeholder="M.Mustermann" required />
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Bitte warten…' : view === 'login' ? 'Anmelden' : view === 'register' ? 'Registrieren' : 'Link anfordern'}
            </Button>
          </form>

          <div className="mt-4 text-center space-y-2">
            {view === 'forgot' ? (
              <button type="button" onClick={() => setView('login')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Zurück zur Anmeldung
              </button>
            ) : (
              <button type="button" onClick={() => setView(view === 'login' ? 'register' : 'login')} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                {view === 'login' ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

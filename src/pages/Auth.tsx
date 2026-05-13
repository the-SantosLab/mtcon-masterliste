import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
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

type View = 'login' | 'forgot';

export default function Auth() {
  const { session, loading, signIn } = useAuth();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground text-sm">Laden</p></div>;
  if (session) {
    const mod = typeof window !== 'undefined' ? localStorage.getItem('mtcon.module') : null;
    const isCrmBeta = session.user?.email === 'js@santoslab.de';
    if (!isCrmBeta) {
      localStorage.removeItem('mtcon.module');
      return <Navigate to="/" replace />;
    }
    return <Navigate to={mod === 'crm' ? '/crm/dashboard' : mod === 'ops' ? '/' : '/modules'} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (view === 'login') {
        loginSchema.parse({ email, password });
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message.includes('Invalid login') ? 'Ungültige E-Mail oder Passwort' : error.message);
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
    </div>
  );
}

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Mindestens 6 Zeichen'),
});
const signupSchema = loginSchema.extend({
  displayName: z.string().min(2, 'Mindestens 2 Zeichen'),
  shortCode: z.string().min(2, 'Mindestens 2 Zeichen'),
});

export default function Auth() {
  const { session, loading, signIn, signUp } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p className="text-muted-foreground">Laden…</p></div>;
  if (session) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        loginSchema.parse({ email, password });
        const { error } = await signIn(email, password);
        if (error) toast.error(error.message.includes('Invalid login') ? 'Ungültige E-Mail oder Passwort' : error.message);
      } else {
        signupSchema.parse({ email, password, displayName, shortCode });
        const { error } = await signUp(email, password, displayName, shortCode);
        if (error) toast.error(error.message.includes('already registered') ? 'E-Mail bereits registriert' : error.message);
        else toast.success('Registrierung erfolgreich!');
      }
    } catch (err) {
      if (err instanceof z.ZodError) toast.error(err.errors[0].message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">KS</span>
          </div>
          <h1 className="text-xl font-bold text-foreground">KS Command Light</h1>
          <p className="text-sm text-muted-foreground mt-1">Vorgangsverwaltung</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground mb-4">{isLogin ? 'Anmelden' : 'Registrieren'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail</Label>
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@firma.de" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Anzeigename</Label>
                  <Input id="displayName" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Max Mustermann" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortCode">Kürzel</Label>
                  <Input id="shortCode" value={shortCode} onChange={e => setShortCode(e.target.value)} placeholder="M.Mustermann" required />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Bitte warten…' : isLogin ? 'Anmelden' : 'Registrieren'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-sm text-primary hover:underline">
              {isLogin ? 'Noch kein Konto? Registrieren' : 'Bereits registriert? Anmelden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

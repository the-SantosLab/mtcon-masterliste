import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import mtconLogo from '@/assets/mtcon_logo.png';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check URL hash for recovery token (Supabase puts it there after redirect)
    const hash = window.location.hash;
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setReady(true);
    }
    // Also listen for the auth state change event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error('Mindestens 6 Zeichen'); return; }
    if (password !== confirm) { toast.error('Passwörter stimmen nicht überein'); return; }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Passwort erfolgreich gesetzt. Du wirst weitergeleitet…');
      setTimeout(() => navigate('/'), 1500);
    }
    setSubmitting(false);
  };

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
          <h2 className="text-sm font-semibold text-foreground mb-5">Neues Passwort setzen</h2>

          {!ready ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Link wird geprüft…
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Neues Passwort</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Passwort wiederholen</Label>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Passwort bestätigen" required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Bitte warten…' : 'Passwort speichern'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import mtconLogo from '@/assets/mtcon_logo.png';

export default function PortalAuth() {
  const { session, customer, loading } = usePortalAuth();
  const { signIn } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session && customer) {
    return <Navigate to="/portal/tickets" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      toast.error('Anmeldung fehlgeschlagen: ' + error.message);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3">
            <img src={mtconLogo} alt="Logo" className="h-12 w-12 object-contain mx-auto" />
          </div>
          <CardTitle className="text-lg">Support Portal</CardTitle>
          <CardDescription className="text-xs">
            Melden Sie sich mit Ihren Zugangsdaten an
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">E-Mail</Label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="kunde@firma.de"
                className="h-9 text-sm"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Passwort</Label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-9 text-sm"
                required
              />
            </div>
            <Button type="submit" className="w-full h-9 text-sm" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Anmelden
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

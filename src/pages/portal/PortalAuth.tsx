import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import mtconLogo from '@/assets/mtcon_logo.png';
import '@/styles/portal.css';

export default function PortalAuth() {
  const { session, customer, loading, signIn } = usePortalAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="portal-shell flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'hsl(var(--portal-text-secondary))' }} />
      </div>
    );
  }

  if (session && customer) {
    return <Navigate to="/portal" replace />;
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
    <div className="portal-shell flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo + branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl portal-glass-strong mb-6">
            <img src={mtconLogo} alt="MTCON" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
            Willkommen zurück
          </h1>
          <p className="text-sm mt-2" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
            Melden Sie sich im MTCON Support Portal an
          </p>
        </div>

        {/* Login card */}
        <div className="portal-glass-strong p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                E-Mail-Adresse
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@firma.de"
                className="portal-input"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Passwort
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="portal-input"
                required
              />
            </div>
            <button type="submit" className="portal-btn-primary w-full justify-center mt-2" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Anmelden
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] mt-8" style={{ color: 'hsl(var(--portal-text-secondary) / 0.5)' }}>
          © {new Date().getFullYear()} MTCON · Support Portal
        </p>
      </div>
    </div>
  );
}

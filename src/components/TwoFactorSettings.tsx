import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Shield, ShieldCheck, Copy, X } from 'lucide-react';

interface EnrollState {
  factorId: string;
  qr: string;
  secret: string;
}

export function TwoFactorSettings() {
  const [loading, setLoading] = useState(true);
  const [enrolledFactorId, setEnrolledFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { toast.error(error.message); setLoading(false); return; }
    const verified = data?.totp?.find(f => f.status === 'verified');
    setEnrolledFactorId(verified?.id || null);
    // Clean up unverified leftovers from previous attempts
    const unverified = data?.totp?.filter(f => f.status !== 'verified') || [];
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    // Cleanup any leftover unverified factors first
    const { data: existing } = await supabase.auth.mfa.listFactors();
    const unverified = existing?.totp?.filter(f => f.status !== 'verified') || [];
    for (const f of unverified) await supabase.auth.mfa.unenroll({ factorId: f.id });

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Masterliste (MTCON) ${Date.now()}`,
      issuer: 'Masterliste (MTCON)',
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data) return;
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  };

  const cancelEnroll = async () => {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    setEnroll(null);
    setCode('');
  };

  const verify = async () => {
    if (!enroll || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enroll.factorId,
      code,
    });
    setBusy(false);
    if (error) { toast.error(error.message || 'Code ungültig'); return; }
    toast.success('Zwei-Faktor-Authentifizierung aktiviert');
    setEnroll(null);
    setCode('');
    await refresh();
  };

  const disable = async () => {
    if (!enrolledFactorId) return;
    if (!confirm('2FA wirklich deaktivieren?')) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: enrolledFactorId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Zwei-Faktor-Authentifizierung deaktiviert');
    await refresh();
  };

  const copySecret = () => {
    if (!enroll) return;
    navigator.clipboard.writeText(enroll.secret);
    toast.success('Code kopiert');
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Laden…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {enrolledFactorId ? (
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
        ) : (
          <Shield className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Zwei-Faktor-Authentifizierung (TOTP)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enrolledFactorId
              ? 'Aktiv — beim Login wird ein 6-stelliger Code aus deiner Authenticator-App verlangt.'
              : 'Nicht aktiv — empfohlen für zusätzlichen Schutz deines Kontos.'}
          </p>
        </div>
      </div>

      {!enroll && !enrolledFactorId && (
        <Button size="sm" onClick={startEnroll} disabled={busy} className="h-8 text-xs">
          Zwei-Faktor aktivieren
        </Button>
      )}

      {!enroll && enrolledFactorId && (
        <Button size="sm" variant="outline" onClick={disable} disabled={busy} className="h-8 text-xs">
          2FA deaktivieren
        </Button>
      )}

      {enroll && (
        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-foreground">QR-Code mit Authenticator-App scannen</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">z.B. Google Authenticator, Authy, 1Password</p>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEnroll}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex justify-center">
            <div className="bg-white p-3 rounded">
              <img src={enroll.qr} alt="2FA QR Code" className="h-44 w-44" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Manueller Eingabecode</Label>
            <div className="flex gap-2">
              <Input value={enroll.secret} readOnly className="h-8 text-xs font-mono" />
              <Button size="sm" variant="outline" onClick={copySecret} className="h-8 px-2">
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="totp-code" className="text-[11px] text-muted-foreground">
              6-stelligen Code aus der App eingeben
            </Label>
            <div className="flex gap-2">
              <Input
                id="totp-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-8 text-sm font-mono tracking-widest"
              />
              <Button
                size="sm"
                onClick={verify}
                disabled={busy || code.length !== 6}
                className="h-8 text-xs"
              >
                Bestätigen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ShieldCheck, Smartphone, QrCode, KeyRound, CheckCircle2, AlertTriangle,
  ArrowRight, ArrowLeft, Copy, Loader2, Check,
} from 'lucide-react';

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS: { n: Step; label: string }[] = [
  { n: 0, label: 'Einführung' },
  { n: 1, label: 'App installieren' },
  { n: 2, label: 'QR-Code scannen' },
  { n: 3, label: 'Code bestätigen' },
  { n: 4, label: 'Fertig' },
];

export default function MfaGuide() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.find(f => f.status === 'verified');
      if (verified) { setAlreadyEnrolled(true); setStep(4); }
      // clean up unverified leftovers
      const unverified = data?.totp?.filter(f => f.status !== 'verified') || [];
      for (const f of unverified) await supabase.auth.mfa.unenroll({ factorId: f.id });
      setLoading(false);
    })();
  }, []);

  const startEnroll = async () => {
    if (enroll) { setStep(2); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `KS Command (${new Date().toISOString().slice(0, 10)})`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data) return;
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setStep(2);
  };

  const verify = async () => {
    if (!enroll || code.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code });
    setBusy(false);
    if (error) { toast.error(error.message || 'Code ungültig'); return; }
    toast.success('Zwei-Faktor-Authentifizierung aktiviert');
    setStep(4);
  };

  const copySecret = () => {
    if (!enroll) return;
    navigator.clipboard.writeText(enroll.secret);
    toast.success('Code kopiert');
  };

  const goNext = async () => {
    if (step === 0) setStep(1);
    else if (step === 1) await startEnroll();
    else if (step === 2) setStep(3);
    else if (step === 3) await verify();
  };

  const goBack = async () => {
    if (step === 3) setStep(2);
    else if (step === 2) {
      // cancel enrollment when going back to install
      if (enroll) {
        await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
        setEnroll(null);
      }
      setStep(1);
    }
    else if (step === 1) setStep(0);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sicherheit</p>
          <h1 className="text-xl font-semibold text-foreground mt-1">
            Zwei-Faktor-Authentifizierung einrichten
          </h1>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Folgen Sie den Schritten unten — Sie richten 2FA direkt hier in der Anleitung ein.
            {!alreadyEnrolled && <> Die Einrichtung ist bis <span className="text-foreground font-medium">Freitag, 22. Mai 2026</span> verpflichtend.</>}
          </p>
        </div>

        <Stepper current={step} />

        <div className="rounded-md border border-border bg-card/40 p-5 min-h-[280px]">
          {step === 0 && <StepIntro />}
          {step === 1 && <StepInstall />}
          {step === 2 && enroll && <StepScan qr={enroll.qr} secret={enroll.secret} onCopy={copySecret} />}
          {step === 2 && !enroll && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {step === 3 && <StepVerify code={code} setCode={setCode} />}
          {step === 4 && <StepDone alreadyEnrolled={alreadyEnrolled} />}
        </div>

        {step < 4 && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0 || busy} className="h-8 text-xs gap-1">
              <ArrowLeft className="h-3 w-3" /> Zurück
            </Button>
            <Button
              size="sm"
              onClick={goNext}
              disabled={busy || (step === 3 && code.length !== 6)}
              className="h-8 text-xs gap-1"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {step === 0 && 'Los geht\'s'}
              {step === 1 && 'App ist installiert — weiter'}
              {step === 2 && 'QR-Code gescannt — weiter'}
              {step === 3 && 'Bestätigen'}
              {!busy && <ArrowRight className="h-3 w-3" />}
            </Button>
          </div>
        )}

        {step === 4 && (
          <div className="flex justify-end gap-2">
            <Link to="/profile"><Button variant="outline" size="sm" className="h-8 text-xs">Profil</Button></Link>
            <Button size="sm" onClick={() => navigate('/')} className="h-8 text-xs gap-1">
              Zum Dashboard <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Stepper({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <div key={s.n} className="flex items-center gap-1.5 flex-1">
            <div className={`h-6 w-6 rounded-full text-[10px] font-semibold flex items-center justify-center shrink-0 ${
              done ? 'bg-emerald-500/20 text-emerald-500'
                : active ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}>
              {done ? <Check className="h-3 w-3" /> : s.n + 1}
            </div>
            <span className={`text-[10px] uppercase tracking-wider truncate ${
              active ? 'text-foreground font-medium' : 'text-muted-foreground'
            }`}>{s.label}</span>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${done ? 'bg-emerald-500/40' : 'bg-border'}`} />}
          </div>
        );
      })}
    </div>
  );
}

function StepIntro() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <p className="text-sm font-medium text-foreground">Was Sie erwartet</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        In den nächsten ca. 2 Minuten richten Sie die Zwei-Faktor-Authentifizierung (2FA) für Ihr Konto ein.
        Nach Abschluss benötigen Sie beim Login zusätzlich zum Passwort einen 6-stelligen Code aus einer
        Authenticator-App auf Ihrem Smartphone.
      </p>
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Sie benötigen ein Smartphone mit Internetzugang. Halten Sie es bereit, bevor Sie weitermachen.
        </p>
      </div>
    </div>
  );
}

function StepInstall() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" />
        <p className="text-sm font-medium text-foreground">Authenticator-App installieren</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Installieren Sie eine der folgenden Apps aus dem App Store (iOS) oder Google Play Store (Android):
      </p>
      <ul className="space-y-1.5">
        {[
          'Google Authenticator',
          'Microsoft Authenticator',
          'Authy',
          '1Password (für bestehende 1Password-Nutzer)',
        ].map(a => (
          <li key={a} className="flex items-center gap-2 text-xs text-foreground">
            <Check className="h-3 w-3 text-emerald-500" /> {a}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Sobald die App installiert und geöffnet ist, klicken Sie unten auf „App ist installiert — weiter".
      </p>
    </div>
  );
}

function StepScan({ qr, secret, onCopy }: { qr: string; secret: string; onCopy: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        <p className="text-sm font-medium text-foreground">QR-Code mit der App scannen</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Öffnen Sie Ihre Authenticator-App, tippen Sie auf <span className="text-foreground font-medium">„Konto hinzufügen"</span> bzw. das Plus-Symbol
        und scannen Sie den QR-Code unten.
      </p>
      <div className="flex justify-center">
        <div className="bg-white p-3 rounded">
          <img src={qr} alt="2FA QR Code" className="h-48 w-48" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground">
          Kein Scan möglich? Code manuell in der App eintragen:
        </Label>
        <div className="flex gap-2">
          <Input value={secret} readOnly className="h-8 text-xs font-mono" />
          <Button size="sm" variant="outline" onClick={onCopy} className="h-8 px-2">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepVerify({ code, setCode }: { code: string; setCode: (c: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-primary" />
        <p className="text-sm font-medium text-foreground">6-stelligen Code eingeben</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Ihre Authenticator-App zeigt nun einen 6-stelligen Code, der sich alle 30 Sekunden ändert.
        Geben Sie den aktuellen Code ein, um die Einrichtung abzuschließen.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="totp-code" className="text-[11px] text-muted-foreground">
          Aktueller Code aus der App
        </Label>
        <Input
          id="totp-code"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="h-12 text-2xl text-center font-mono tracking-[0.5em]"
          autoFocus
        />
      </div>
    </div>
  );
}

function StepDone({ alreadyEnrolled }: { alreadyEnrolled: boolean }) {
  return (
    <div className="space-y-4 text-center py-4">
      <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {alreadyEnrolled ? '2FA ist bereits aktiv' : '2FA erfolgreich aktiviert'}
        </p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md mx-auto">
          Beim nächsten Login werden Sie nach dem 6-stelligen Code aus Ihrer Authenticator-App gefragt.
          Bewahren Sie das Gerät sicher auf.
        </p>
      </div>
    </div>
  );
}

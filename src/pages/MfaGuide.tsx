import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { ShieldCheck, Smartphone, QrCode, KeyRound, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

export default function MfaGuide() {
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sicherheit</p>
          <h1 className="text-xl font-semibold text-foreground mt-1">Anleitung: Zwei-Faktor-Authentifizierung (2FA) einrichten</h1>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Aus Sicherheitsgründen ist die 2FA für alle Nutzer:innen verpflichtend. Bitte richten Sie diese
            <span className="text-foreground font-medium"> bis Freitag, 22. Mai 2026 </span>
            ein. Ohne aktive 2FA ist nach diesem Datum kein Arbeiten im System mehr möglich.
          </p>
        </div>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Sie benötigen ein Smartphone mit einer Authenticator-App. Empfohlen: Google Authenticator,
            Microsoft Authenticator, Authy oder 1Password. Ohne App kann 2FA nicht eingerichtet werden.
          </p>
        </div>

        <ol className="space-y-4">
          <Step
            icon={Smartphone}
            n={1}
            title="Authenticator-App installieren"
            body="Installieren Sie eine der folgenden Apps aus dem App Store oder Google Play Store: Google Authenticator, Microsoft Authenticator, Authy oder 1Password."
          />
          <Step
            icon={KeyRound}
            n={2}
            title="Profil öffnen"
            body={<>Klicken Sie oben rechts auf Ihren Avatar und wählen Sie <span className="font-medium text-foreground">Profil</span>. Scrollen Sie zum Abschnitt <span className="font-medium text-foreground">Sicherheit</span>.</>}
            cta={<Link to="/profile" className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline">Profil öffnen <ArrowRight className="h-3 w-3" /></Link>}
          />
          <Step
            icon={ShieldCheck}
            n={3}
            title="2FA aktivieren"
            body={<>Klicken Sie auf den Button <span className="font-medium text-foreground">„Zwei-Faktor aktivieren“</span>. Es wird ein QR-Code angezeigt.</>}
          />
          <Step
            icon={QrCode}
            n={4}
            title="QR-Code scannen"
            body={<>Öffnen Sie Ihre Authenticator-App, tippen Sie auf <span className="font-medium text-foreground">„Konto hinzufügen“</span> bzw. das Plus-Symbol und scannen Sie den QR-Code. Alternativ können Sie den darunter angezeigten Eingabecode manuell in der App eintragen.</>}
          />
          <Step
            icon={CheckCircle2}
            n={5}
            title="6-stelligen Code bestätigen"
            body={<>Geben Sie den von der App generierten 6-stelligen Code im Eingabefeld ein und klicken Sie auf <span className="font-medium text-foreground">„Bestätigen“</span>. 2FA ist nun aktiv.</>}
          />
        </ol>

        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-medium text-foreground">Was passiert beim nächsten Login?</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nach Eingabe von E-Mail und Passwort werden Sie aufgefordert, einen 6-stelligen Code aus
            Ihrer Authenticator-App einzugeben. Erst danach erhalten Sie Zugriff auf das System.
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
          <p className="text-xs font-medium text-foreground">Probleme oder Gerätewechsel?</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Sollten Sie Ihr Gerät verlieren oder wechseln, wenden Sie sich an einen Administrator.
            Dieser kann Ihre 2FA zurücksetzen, sodass Sie eine neue Einrichtung durchführen können.
          </p>
        </div>

        <div className="flex justify-end">
          <Link
            to="/profile"
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 h-8 text-xs font-medium hover:bg-primary/90"
          >
            Jetzt 2FA einrichten <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}

function Step({ icon: Icon, n, title, body, cta }: {
  icon: any; n: number; title: string; body: React.ReactNode; cta?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 rounded-md border border-border bg-card/40 p-3">
      <div className="flex flex-col items-center gap-1.5 pt-0.5">
        <div className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
          {n}
        </div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{body}</p>
        {cta && <div className="mt-2">{cta}</div>}
      </div>
    </li>
  );
}

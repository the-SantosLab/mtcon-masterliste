import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type OAuthClient = {
  name?: string | null;
  client_name?: string | null;
  redirect_uri?: string | null;
  redirect_uris?: string[] | null;
};

type OAuthDetails = {
  client?: OAuthClient | null;
  scopes?: string[] | string | null;
  scope?: string | null;
  redirect_uri?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthDecisionResult = {
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (authorizationId: string) => Promise<{ data: OAuthDetails | null; error: Error | null }>;
  approveAuthorization: (authorizationId: string) => Promise<{ data: OAuthDecisionResult | null; error: Error | null }>;
  denyAuthorization: (authorizationId: string) => Promise<{ data: OAuthDecisionResult | null; error: Error | null }>;
};

function getOAuthApi(): OAuthApi | null {
  const authWithOAuth = supabase.auth as typeof supabase.auth & { oauth?: OAuthApi };
  return authWithOAuth.oauth ?? null;
}

function getClientName(details: OAuthDetails | null) {
  return details?.client?.name ?? details?.client?.client_name ?? "externe Anwendung";
}

function getRedirectUri(details: OAuthDetails | null) {
  return details?.redirect_uri ?? details?.client?.redirect_uri ?? details?.client?.redirect_uris?.[0] ?? "Nicht angegeben";
}

function getScopes(details: OAuthDetails | null) {
  const raw = details?.scopes ?? details?.scope ?? "openid email profile";
  const scopes = Array.isArray(raw) ? raw : raw.split(/\s+/);
  return scopes.map((scope) => scope.trim()).filter(Boolean);
}

function scopeLabel(scope: string) {
  if (scope === "openid") return "Deine Anmeldung bestätigen";
  if (scope === "email") return "Deine E-Mail-Adresse teilen";
  if (scope === "profile") return "Dein Basisprofil teilen";
  return `Zusätzliche Berechtigung: ${scope}`;
}

export default function OAuthConsent() {
  const { session, loading, user } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  const nextPath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search],
  );

  useEffect(() => {
    let active = true;
    if (loading || !session) return;

    const load = async () => {
      if (!authorizationId) {
        setError("Diese Autorisierungsanfrage ist unvollständig.");
        return;
      }

      const oauth = getOAuthApi();
      if (!oauth) {
        setError("Der OAuth-Consent ist noch nicht verfügbar. Bitte die Seite neu laden.");
        return;
      }

      const { data, error: detailsError } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message || "Diese Autorisierungsanfrage konnte nicht geladen werden.");
        return;
      }

      const immediateRedirect = data?.redirect_url ?? data?.redirect_to;
      if (immediateRedirect && !data?.client) {
        window.location.href = immediateRedirect;
        return;
      }

      setDetails(data);
    };

    load();
    return () => {
      active = false;
    };
  }, [authorizationId, loading, session]);

  const decide = async (decision: "approve" | "deny") => {
    const oauth = getOAuthApi();
    if (!oauth || !authorizationId) return;
    setBusy(decision);
    setError(null);

    const { data, error: decisionError } = decision === "approve"
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);

    if (decisionError) {
      setBusy(null);
      setError(decisionError.message || "Die Entscheidung konnte nicht gespeichert werden.");
      return;
    }

    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(null);
      setError("Der OAuth-Server hat keine Rücksprungadresse zurückgegeben.");
      return;
    }

    window.location.href = target;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background glass-bg flex items-center justify-center p-6">
        <div className="glass-card p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Autorisierung wird geladen
        </div>
      </main>
    );
  }

  if (!session) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(nextPath)}`} replace />;
  }

  const scopes = getScopes(details);
  const clientName = getClientName(details);

  return (
    <main className="min-h-screen bg-background glass-bg flex items-center justify-center p-6">
      <section className="glass-card w-full max-w-lg p-6 space-y-6" aria-labelledby="oauth-consent-title">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 id="oauth-consent-title" className="text-base font-semibold text-foreground">
              {clientName} mit Masterliste verbinden
            </h1>
            <p className="text-sm text-muted-foreground">
              {clientName} kann die freigegebenen Agent-Tools in deinem Namen verwenden.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!details && !error ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Details werden geladen
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Angemeldetes Konto</div>
                <div className="text-foreground">{user?.email ?? "Unbekannt"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground">Rücksprungadresse</div>
                <div className="break-all text-foreground">{getRedirectUri(details)}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Freigaben</div>
              <div className="space-y-2">
                {scopes.map((scope) => (
                  <div key={scope} className="flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{scopeLabel(scope)}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Masterliste-Daten nur gemäß deinen bestehenden Berechtigungen lesen</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Diese Verbindung umgeht keine Rollen, Sichtbarkeitsregeln oder Backend-Richtlinien.
            </p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => decide("deny")} disabled={!!busy}>
                {busy === "deny" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Verbindung abbrechen
              </Button>
              <Button onClick={() => decide("approve")} disabled={!!busy || !details}>
                {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Zugriff erlauben
              </Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
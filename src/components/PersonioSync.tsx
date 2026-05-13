import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Loader2, KeyRound, RefreshCw, FlaskConical, Save, CheckCircle2, AlertCircle } from 'lucide-react';

interface SyncResult {
  ok?: boolean;
  error?: string;
  missing?: string[];
  hint?: string;
  dry_run?: boolean;
  total?: number;
  sample?: Array<Record<string, unknown>>;
  synced?: number;
  deactivated?: number;
  import?: { summary?: { total: number; created: number; updated: number; errors: number } };
}

interface SettingsResponse {
  config: { client_id?: string; base_url?: string; client_secret?: string; last_sync_at?: string; last_sync_count?: number };
  has_secrets: { client_secret?: boolean };
  updated_at: string | null;
  configured: boolean;
}

export function PersonioSync({ onDone }: { onDone?: () => void }) {
  const [running, setRunning] = useState<'sync' | 'dry' | 'save' | 'load' | null>('load');
  const [deactivate, setDeactivate] = useState(true);
  const [sendInvite, setSendInvite] = useState(false);
  const [defaultRole, setDefaultRole] = useState<'staff' | 'viewer' | 'admin'>('staff');
  const [result, setResult] = useState<SyncResult | null>(null);

  // Form state
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.personio.de');
  const [hasSecret, setHasSecret] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<{ at?: string; count?: number }>({});

  const loadSettings = async () => {
    setRunning('load');
    try {
      const { data, error } = await supabase.functions.invoke('integration-settings', {
        body: { action: 'get', integration_id: 'personio' },
      });
      if (error) throw error;
      const r = data as SettingsResponse;
      setClientId(r.config?.client_id || '');
      setBaseUrl(r.config?.base_url || 'https://api.personio.de');
      setHasSecret(!!r.has_secrets?.client_secret);
      setClientSecret('');
      setSavedAt(r.updated_at);
      setLastSync({ at: r.config?.last_sync_at, count: r.config?.last_sync_count });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Konnte Einstellungen nicht laden';
      toast({ title: 'Fehler', description: msg, variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const save = async () => {
    if (!clientId.trim()) {
      toast({ title: 'Client-ID fehlt', variant: 'destructive' });
      return;
    }
    if (!hasSecret && !clientSecret.trim()) {
      toast({ title: 'Client-Secret fehlt', variant: 'destructive' });
      return;
    }
    setRunning('save');
    try {
      const { error } = await supabase.functions.invoke('integration-settings', {
        body: {
          action: 'save',
          integration_id: 'personio',
          config: {
            client_id: clientId.trim(),
            base_url: baseUrl.trim() || 'https://api.personio.de',
            client_secret: clientSecret, // leer = bestehender Wert bleibt
          },
        },
      });
      if (error) throw error;
      toast({ title: 'Zugangsdaten gespeichert' });
      await loadSettings();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
      toast({ title: 'Fehler', description: msg, variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  const run = async (mode: 'sync' | 'dry') => {
    setRunning(mode);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-personio-employees', {
        body: {
          dry_run: mode === 'dry',
          deactivate_missing: deactivate,
          default_role: defaultRole,
          send_invite: sendInvite,
        },
      });
      if (error) throw error;
      setResult(data as SyncResult);
      if ((data as SyncResult)?.ok) {
        toast({ title: mode === 'dry' ? 'Probelauf erfolgreich' : 'Synchronisation abgeschlossen' });
        if (mode === 'sync') { onDone?.(); loadSettings(); }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setResult({ ok: false, error: msg });
      toast({ title: 'Fehler', description: msg, variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  const ready = !!clientId && hasSecret;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Personio-Synchronisation</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Holt alle Mitarbeitenden aus Personio und gleicht sie mit der Masterliste ab. Bestehende
          Profile werden anhand der E-Mail aktualisiert, neue Mitarbeitende werden angelegt.
        </p>
      </div>

      {/* Credentials-Maske */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5" />
            <span className="text-xs font-semibold">Zugangsdaten</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            {ready ? (
              <><CheckCircle2 className="h-3 w-3 text-green-500" /><span className="text-muted-foreground">Konfiguriert</span></>
            ) : (
              <><AlertCircle className="h-3 w-3 text-amber-500" /><span className="text-muted-foreground">Unvollständig</span></>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-client-id" className="text-xs">Client-ID</Label>
            <Input
              id="p-client-id"
              autoComplete="off"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="z. B. 12345678-aaaa-..."
              maxLength={200}
              className="h-8 text-xs mt-1"
              disabled={running === 'load'}
            />
          </div>
          <div>
            <Label htmlFor="p-client-secret" className="text-xs">
              Client-Secret {hasSecret && <span className="text-muted-foreground">(gespeichert – nur ändern bei Bedarf)</span>}
            </Label>
            <Input
              id="p-client-secret"
              type="password"
              autoComplete="new-password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder={hasSecret ? '•••••• unverändert lassen' : 'Personio Client-Secret'}
              maxLength={500}
              className="h-8 text-xs mt-1 font-mono"
              disabled={running === 'load'}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="p-base-url" className="text-xs">API-Endpoint (optional)</Label>
            <Input
              id="p-base-url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.personio.de"
              maxLength={300}
              className="h-8 text-xs mt-1"
              disabled={running === 'load'}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-muted-foreground">
            {savedAt
              ? `Zuletzt geändert: ${new Date(savedAt).toLocaleString('de-DE')}`
              : 'Noch nicht gespeichert'}
          </div>
          <Button size="sm" onClick={save} disabled={running !== null} className="text-xs h-8">
            {running === 'save'
              ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Save className="h-3.5 w-3.5 mr-1" />}
            Zugangsdaten speichern
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
          Die Zugangsdaten werden verschlüsselt im Backend gespeichert und sind nur für Admins lesbar.
          Das Client-Secret wird nach dem Speichern niemals wieder im Klartext angezeigt.
        </p>
      </div>

      {/* Sync-Optionen */}
      <div className="rounded-md border border-border bg-card p-4 space-y-3">
        <span className="text-xs font-semibold">Sync-Optionen</span>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Standardrolle (neue Nutzer)</Label>
            <select
              className="mt-1 w-full h-8 rounded-md border border-border bg-background text-xs px-2"
              value={defaultRole}
              onChange={e => setDefaultRole(e.target.value as 'staff' | 'viewer' | 'admin')}
            >
              <option value="staff">Mitarbeiter</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 h-[58px]">
            <Label htmlFor="deactivate" className="text-xs cursor-pointer">
              Nicht mehr in Personio = deaktivieren
            </Label>
            <Switch id="deactivate" checked={deactivate} onCheckedChange={setDeactivate} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 h-[58px]">
            <Label htmlFor="invite" className="text-xs cursor-pointer">
              Einladung an neue Nutzer senden
            </Label>
            <Switch id="invite" checked={sendInvite} onCheckedChange={setSendInvite} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-muted-foreground">
            {lastSync.at
              ? `Letzter Sync: ${new Date(lastSync.at).toLocaleString('de-DE')}${typeof lastSync.count === 'number' ? ` · ${lastSync.count} Mitarbeitende` : ''}`
              : 'Noch kein Sync ausgeführt'}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm" onClick={() => run('dry')}
              disabled={running !== null || !ready} className="text-xs h-8"
            >
              {running === 'dry'
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
              Probelauf
            </Button>
            <Button
              size="sm" onClick={() => run('sync')}
              disabled={running !== null || !ready} className="text-xs h-8"
            >
              {running === 'sync'
                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Jetzt synchronisieren
            </Button>
          </div>
        </div>
        {!ready && (
          <p className="text-[11px] text-amber-600">
            Sync ist erst möglich, sobald Client-ID und Client-Secret gespeichert sind.
          </p>
        )}
      </div>

      {result && (
        <div className="rounded-md border border-border bg-card p-3 text-xs space-y-1">
          {result.error && (
            <div className="text-destructive">
              <div className="font-medium">Fehler: {result.error}</div>
              {result.hint && <div className="mt-1 text-muted-foreground">{result.hint}</div>}
            </div>
          )}
          {result.ok && result.dry_run && (
            <>
              <div><span className="text-muted-foreground">Gefundene Mitarbeitende:</span> {result.total}</div>
              <div className="text-muted-foreground">Keine Daten geschrieben. Beispiel (erste 5):</div>
              <pre className="mt-1 max-h-48 overflow-auto bg-muted p-2 rounded text-[10px]">
                {JSON.stringify(result.sample, null, 2)}
              </pre>
            </>
          )}
          {result.ok && !result.dry_run && (
            <>
              <div><span className="text-muted-foreground">Synchronisiert:</span> {result.synced}</div>
              {result.import?.summary && (
                <div className="text-muted-foreground">
                  Neu: {result.import.summary.created} · Aktualisiert: {result.import.summary.updated} · Fehler: {result.import.summary.errors}
                </div>
              )}
              {typeof result.deactivated === 'number' && result.deactivated > 0 && (
                <div className="text-muted-foreground">Deaktiviert: {result.deactivated}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

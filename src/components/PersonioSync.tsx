import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Loader2, KeyRound, RefreshCw, FlaskConical } from 'lucide-react';

interface SyncResult {
  ok?: boolean;
  error?: string;
  missing_secrets?: string[];
  hint?: string;
  dry_run?: boolean;
  total?: number;
  sample?: Array<Record<string, unknown>>;
  synced?: number;
  deactivated?: number;
  import?: { summary?: { total: number; created: number; updated: number; errors: number } };
}

export function PersonioSync({ onDone }: { onDone?: () => void }) {
  const [running, setRunning] = useState<'sync' | 'dry' | null>(null);
  const [deactivate, setDeactivate] = useState(true);
  const [sendInvite, setSendInvite] = useState(false);
  const [defaultRole, setDefaultRole] = useState<'staff' | 'viewer' | 'admin'>('staff');
  const [result, setResult] = useState<SyncResult | null>(null);

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
        if (mode === 'sync') onDone?.();
      } else if ((data as SyncResult)?.missing_secrets) {
        toast({
          title: 'Personio-Credentials fehlen',
          description: 'Hinterlegen Sie PERSONIO_CLIENT_ID und PERSONIO_CLIENT_SECRET.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setResult({ ok: false, error: msg });
      toast({ title: 'Fehler', description: msg, variant: 'destructive' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Personio-Synchronisation</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Holt alle Mitarbeitenden aus Personio und gleicht sie mit der Masterliste ab. Bestehende
          Profile werden anhand der E-Mail aktualisiert, neue Mitarbeitende werden angelegt. Die
          Funktion ist sofort einsatzbereit, sobald die Personio-API-Zugangsdaten als Secrets
          hinterlegt sind.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <div className="flex items-center gap-2 font-medium mb-1">
          <KeyRound className="h-3.5 w-3.5" /> Erforderliche Secrets
        </div>
        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
          <li><code>PERSONIO_CLIENT_ID</code></li>
          <li><code>PERSONIO_CLIENT_SECRET</code></li>
          <li><code>PERSONIO_BASE_URL</code> (optional, Standard <code>https://api.personio.de</code>)</li>
        </ul>
      </div>

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

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => run('dry')}
          disabled={running !== null}
          className="text-xs h-8"
        >
          {running === 'dry'
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <FlaskConical className="h-3.5 w-3.5 mr-1" />}
          Probelauf (ohne Schreibzugriff)
        </Button>
        <Button
          size="sm"
          onClick={() => run('sync')}
          disabled={running !== null}
          className="text-xs h-8"
        >
          {running === 'sync'
            ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Jetzt synchronisieren
        </Button>
      </div>

      {result && (
        <div className="rounded-md border border-border bg-card p-3 text-xs space-y-1">
          {result.error && (
            <div className="text-destructive">
              <div className="font-medium">Fehler: {result.error}</div>
              {result.missing_secrets && (
                <div className="mt-1 text-muted-foreground">
                  Fehlende Secrets: {result.missing_secrets.join(', ')}
                </div>
              )}
              {result.hint && <div className="mt-1 text-muted-foreground">{result.hint}</div>}
            </div>
          )}
          {result.ok && result.dry_run && (
            <>
              <div><span className="text-muted-foreground">Gefundene Mitarbeitende:</span> {result.total}</div>
              <div className="text-muted-foreground">
                Es wurden keine Daten geschrieben. Beispiel (erste 5):
              </div>
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

      <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
        Hinweis: Die Personio-API erfordert Zugangsdaten vom Typ „Mitarbeiterzugriff" inkl. Lese­rechte
        für die Felder E-Mail, Vor-/Nachname, Abteilung, Status, Position und Vorgesetzte:r.
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Save, PlugZap, CheckCircle2, XCircle, Info } from 'lucide-react';
import { CrmLayout } from '@/components/CrmLayout';
import { CrmSettingsTabs } from '@/components/crm/CrmSettingsTabs';

type Status = {
  configured: boolean;
  source?: 'env' | 'db' | 'none';
  missing?: string[];
  token_acquired?: boolean;
  error?: string;
};

export default function CrmMicrosoft365() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('integration_settings')
      .select('config')
      .eq('id', 'ms365')
      .maybeSingle();
    const c = (data?.config ?? {}) as Record<string, string>;
    setTenantId(c.tenant_id ?? '');
    setClientId(c.client_id ?? '');
    setHasSecret(Boolean(c.client_secret));
    setClientSecret('');
    setLoading(false);
    void testConnection(true);
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!tenantId.trim() || !clientId.trim()) {
      toast.error('Tenant ID und Client ID sind erforderlich.');
      return;
    }
    setSaving(true);
    const payload: Record<string, string> = {
      tenant_id: tenantId.trim(),
      client_id: clientId.trim(),
    };
    if (clientSecret.trim()) payload.client_secret = clientSecret.trim();
    else if (!hasSecret) {
      toast.error('Client Secret ist erforderlich.');
      setSaving(false);
      return;
    } else {
      // preserve existing secret
      const { data } = await supabase
        .from('integration_settings').select('config').eq('id', 'ms365').maybeSingle();
      const existing = (data?.config ?? {}) as Record<string, string>;
      if (existing.client_secret) payload.client_secret = existing.client_secret;
    }
    const { error } = await supabase
      .from('integration_settings')
      .upsert({ id: 'ms365', config: payload, updated_by: (await supabase.auth.getUser()).data.user?.id });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Microsoft 365 Zugangsdaten gespeichert.');
    setClientSecret('');
    setHasSecret(true);
    void testConnection();
  };

  const testConnection = async (silent = false) => {
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('microsoft-365-sync', { body: {} });
    setTesting(false);
    if (error) {
      setStatus({ configured: false, error: error.message });
      if (!silent) toast.error('Test fehlgeschlagen: ' + error.message);
      return;
    }
    setStatus(data as Status);
    if (!silent) {
      if ((data as Status)?.token_acquired) toast.success('Verbindung zu Microsoft Graph erfolgreich.');
      else if (!(data as Status)?.configured) toast.message('Noch nicht konfiguriert.');
      else toast.error('Token konnte nicht geholt werden.');
    }
  };

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Microsoft 365 Integration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zugangsdaten für die App-Registrierung in Microsoft Entra (Azure AD). Wird vom Edge-Function-Worker für
          Mail- und Kalender-Sync per Graph API verwendet (Client-Credentials-Flow).
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Benötigt</AlertTitle>
        <AlertDescription className="text-sm">
          App-Registrierung in Entra ID → <strong>Application Permissions</strong> auf Microsoft Graph
          (z.&nbsp;B. <code>Mail.Read</code>, <code>Calendars.Read</code>) + <strong>Admin Consent</strong>.
          Anschließend Tenant ID, Client ID und ein Client Secret hier eintragen.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5" /> Verbindungsstatus
          </CardTitle>
          <CardDescription>Prüft Token-Abruf gegen <code>login.microsoftonline.com</code>.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          {status?.token_acquired ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Verbunden</Badge>
          ) : status?.configured ? (
            <Badge variant="destructive" className="gap-1"><XCircle className="h-3.5 w-3.5" /> Fehler</Badge>
          ) : (
            <Badge variant="secondary">Nicht konfiguriert</Badge>
          )}
          {status?.source && <span className="text-xs text-muted-foreground">Quelle: {status.source}</span>}
          {status?.error && <span className="text-xs text-destructive">{status.error}</span>}
          <Button size="sm" variant="outline" className="ml-auto" disabled={testing} onClick={() => testConnection()}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Test'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zugangsdaten</CardTitle>
          <CardDescription>
            Werden verschlüsselt in <code>integration_settings</code> gespeichert (nur Admins können lesen/schreiben).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade…
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="tenant">Tenant ID (Directory ID)</Label>
                <Input id="tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">Client ID (Application ID)</Label>
                <Input id="client" value={clientId} onChange={(e) => setClientId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="secret">
                  Client Secret {hasSecret && <span className="text-xs text-muted-foreground">(gespeichert — leer lassen, um nicht zu ändern)</span>}
                </Label>
                <Input id="secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={hasSecret ? '••••••••••••' : 'Secret Value aus Entra ID'} autoComplete="new-password" />
              </div>
              <div className="flex justify-end">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Speichern
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

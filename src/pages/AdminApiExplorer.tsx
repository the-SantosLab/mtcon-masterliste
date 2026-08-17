import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, Play, KeyRound, Eye, EyeOff } from 'lucide-react';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type Param = { name: string; hint?: string };

type Endpoint = {
  id: string;
  resource: string;
  method: Method;
  label: string;
  params?: Param[];
  body?: string;
};

const ENDPOINTS: Endpoint[] = [
  { id: 'directory', resource: '', method: 'GET', label: 'Verzeichnis (alle Ressourcen)' },
  {
    id: 'cases-list', resource: 'cases', method: 'GET', label: 'Vorgänge – Liste',
    params: [{ name: 'status' }, { name: 'department_id' }, { name: 'assignee_id' }, { name: 'q', hint: 'Suche Nummer/Projekt/Kunde' }, { name: 'include_deleted', hint: 'true/false' }, { name: 'limit', hint: 'max 1000' }, { name: 'offset' }],
  },
  { id: 'cases-one', resource: 'cases', method: 'GET', label: 'Vorgang – Einzelabruf', params: [{ name: 'id', hint: 'case id' }] },
  {
    id: 'cases-create', resource: 'cases', method: 'POST', label: 'Vorgang anlegen',
    body: JSON.stringify({ project_name: 'Testvorgang', client_name: 'Muster GmbH', due_at: '2026-09-01', urgency: 2 }, null, 2),
  },
  {
    id: 'cases-update', resource: 'cases', method: 'PATCH', label: 'Vorgang ändern',
    params: [{ name: 'id' }], body: JSON.stringify({ status: 'in_arbeit' }, null, 2),
  },
  { id: 'cases-delete', resource: 'cases', method: 'DELETE', label: 'Vorgang löschen (Soft-Delete)', params: [{ name: 'id' }] },
  { id: 'tasks-list', resource: 'case_tasks', method: 'GET', label: 'Unteraufgaben – Liste', params: [{ name: 'case_id' }] },
  {
    id: 'tasks-create', resource: 'case_tasks', method: 'POST', label: 'Unteraufgabe anlegen',
    body: JSON.stringify({ case_id: '', title: 'Zeichnung prüfen', department_id: '' }, null, 2),
  },
  {
    id: 'tasks-update', resource: 'case_tasks', method: 'PATCH', label: 'Unteraufgabe ändern',
    params: [{ name: 'id' }], body: JSON.stringify({ completed: true }, null, 2),
  },
  { id: 'tasks-delete', resource: 'case_tasks', method: 'DELETE', label: 'Unteraufgabe löschen', params: [{ name: 'id' }] },
  { id: 'notes-list', resource: 'case_notes', method: 'GET', label: 'Notizen – Liste', params: [{ name: 'case_id' }] },
  { id: 'notes-create', resource: 'case_notes', method: 'POST', label: 'Notiz anlegen', body: JSON.stringify({ case_id: '', content: 'Notiztext' }, null, 2) },
  { id: 'chat-list', resource: 'case_chat', method: 'GET', label: 'Chat – Liste', params: [{ name: 'case_id' }] },
  { id: 'chat-create', resource: 'case_chat', method: 'POST', label: 'Chat-Nachricht senden', body: JSON.stringify({ case_id: '', message: 'Hallo' }, null, 2) },
  { id: 'watchers-get', resource: 'case_watchers', method: 'GET', label: 'Watcher – Abruf', params: [{ name: 'id', hint: 'case id' }] },
  {
    id: 'watchers-set', resource: 'case_watchers', method: 'PATCH', label: 'Watcher setzen',
    params: [{ name: 'id', hint: 'case id' }], body: JSON.stringify({ watchers: [], watcher_departments: [] }, null, 2),
  },
  { id: 'activity', resource: 'case_activity', method: 'GET', label: 'Aktivitätsprotokoll', params: [{ name: 'case_id' }] },
  { id: 'tickets', resource: 'tickets', method: 'GET', label: 'Tickets – Liste' },
  { id: 'ticket-messages', resource: 'ticket_messages', method: 'GET', label: 'Ticket-Nachrichten', params: [{ name: 'ticket_id' }] },
  { id: 'ticket-message-create', resource: 'ticket_messages', method: 'POST', label: 'Ticket-Nachricht senden', body: JSON.stringify({ ticket_id: '', message: 'Antworttext' }, null, 2) },
  { id: 'projects', resource: 'projects', method: 'GET', label: 'Projekte – Liste', params: [{ name: 'id' }, { name: 'limit' }] },
  { id: 'projects-create', resource: 'projects', method: 'POST', label: 'Projekt anlegen', body: JSON.stringify({ name: 'Neues Projekt' }, null, 2) },
  { id: 'projects-update', resource: 'projects', method: 'PATCH', label: 'Projekt ändern', params: [{ name: 'id' }], body: JSON.stringify({ status: 'active' }, null, 2) },
  { id: 'users', resource: 'users', method: 'GET', label: 'Nutzer – Liste' },
  { id: 'departments', resource: 'departments', method: 'GET', label: 'Abteilungen – Liste' },
  { id: 'stats', resource: 'stats', method: 'GET', label: 'Kennzahlen' },
];

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-dashboard`;

export default function AdminApiExplorer() {
  const { isAdmin, loading: authLoading, profile } = useAuth();
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id);
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [actorId, setActorId] = useState(profile?.id ?? '');
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [response, setResponse] = useState('');

  const endpoint = useMemo(() => ENDPOINTS.find(e => e.id === endpointId)!, [endpointId]);
  const isWrite = endpoint.method !== 'GET';

  const url = useMemo(() => {
    const qs = new URLSearchParams();
    if (endpoint.resource) qs.set('resource', endpoint.resource);
    for (const p of endpoint.params ?? []) {
      const v = params[p.name]?.trim();
      if (v) qs.set(p.name, v);
    }
    const s = qs.toString();
    return s ? `${BASE}?${s}` : BASE;
  }, [endpoint, params]);

  const curl = useMemo(() => {
    const lines = [`curl -X ${endpoint.method} "${url}"`, `  -H "Authorization: Bearer $DASHBOARD_API_KEY"`];
    if (isWrite) {
      lines.push(`  -H "x-actor-id: ${actorId || '<user-id>'}"`);
      if (endpoint.body !== undefined) {
        lines.push(`  -H "Content-Type: application/json"`);
        lines.push(`  -d '${(body || endpoint.body).replace(/\s+/g, ' ')}'`);
      }
    }
    return lines.join(' \\\n');
  }, [endpoint, url, isWrite, actorId, body]);

  if (!authLoading && !isAdmin) return <Navigate to="/" replace />;

  const selectEndpoint = (id: string) => {
    const ep = ENDPOINTS.find(e => e.id === id)!;
    setEndpointId(id);
    setParams({});
    setBody(ep.body ?? '');
    setResponse('');
    setStatus(null);
    setDuration(null);
  };

  const loadKey = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { toast.error('Nicht angemeldet'); return; }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-dashboard-api-key`, {
      headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.api_key) { toast.error(json?.error === 'Forbidden' ? 'Zugriff verweigert' : `Fehler ${res.status}`); return; }
    setApiKey(json.api_key);
    toast.success('API-Key geladen');
  };

  const run = async () => {
    if (!apiKey.trim()) { toast.error('API-Key fehlt'); return; }
    if (isWrite && !actorId.trim()) { toast.error('x-actor-id fehlt'); return; }
    setRunning(true);
    setResponse('');
    const started = performance.now();
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey.trim()}` };
      let payload: string | undefined;
      if (isWrite) {
        headers['x-actor-id'] = actorId.trim();
        if (body.trim()) {
          try { JSON.parse(body); } catch { toast.error('Body ist kein gültiges JSON'); setRunning(false); return; }
          headers['Content-Type'] = 'application/json';
          payload = body;
        }
      }
      const res = await fetch(url, { method: endpoint.method, headers, body: payload });
      const text = await res.text();
      setStatus(res.status);
      setDuration(Math.round(performance.now() - started));
      try { setResponse(JSON.stringify(JSON.parse(text), null, 2)); } catch { setResponse(text); }
    } catch (e) {
      setStatus(0);
      setResponse(String(e));
    } finally {
      setRunning(false);
    }
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('Kopiert');
  };

  return (
    <AppLayout>
      <div className="space-y-4 max-w-5xl">
        <div>
          <h1 className="text-lg font-semibold text-foreground">API-Explorer</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Endpunkte der Masterlisten-REST-API direkt ausprobieren</p>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">API-Key</Label>
              <div className="flex gap-2">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="DASHBOARD_API_KEY"
                  className="h-8 text-xs font-mono"
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => setShowKey(v => !v)}>
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={loadKey}>
                  <KeyRound className="h-3.5 w-3.5 mr-1" />Laden
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">x-actor-id {isWrite && <span className="text-destructive">*</span>}</Label>
              <Input value={actorId} onChange={e => setActorId(e.target.value)} placeholder="users_profile.id" className="h-8 text-xs font-mono" />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Endpunkt</Label>
            <Select value={endpointId} onValueChange={selectEndpoint}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-80">
                {ENDPOINTS.map(e => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    {e.method} · {e.resource || '—'} · {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(endpoint.params?.length ?? 0) > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {endpoint.params!.map(p => (
                <div key={p.name} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground font-mono">{p.name}</Label>
                  <Input
                    value={params[p.name] ?? ''}
                    onChange={e => setParams(prev => ({ ...prev, [p.name]: e.target.value }))}
                    placeholder={p.hint ?? ''}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              ))}
            </div>
          )}

          {isWrite && endpoint.body !== undefined && (
            <div className="space-y-1.5">
              <Label className="text-xs">Body (JSON)</Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} rows={8} className="text-xs font-mono" />
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] font-mono">{endpoint.method}</Badge>
            <code className="text-[11px] font-mono text-muted-foreground break-all flex-1 min-w-0">{url}</code>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copy(curl)}>
              <Copy className="h-3.5 w-3.5 mr-1" />cURL
            </Button>
            <Button size="sm" className="h-8 text-xs" onClick={run} disabled={running}>
              <Play className="h-3.5 w-3.5 mr-1" />{running ? 'Läuft …' : 'Senden'}
            </Button>
          </div>
        </div>

        {status !== null && (
          <div className="rounded-md border border-border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={status >= 200 && status < 300 ? 'default' : 'destructive'} className="text-[10px] font-mono">
                {status || 'Netzwerkfehler'}
              </Badge>
              {duration !== null && <span className="text-[11px] text-muted-foreground">{duration} ms</span>}
              <div className="flex-1" />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copy(response)}>
                <Copy className="h-3 w-3 mr-1" />Antwort
              </Button>
            </div>
            <pre className="text-[11px] font-mono bg-secondary rounded-md p-3 overflow-auto max-h-[480px] whitespace-pre-wrap break-all">
              {response}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

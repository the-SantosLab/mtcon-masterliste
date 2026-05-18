import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

const OPTIONS: { value: string; label: string }[] = [
  { value: '1', label: '1 Stunde' },
  { value: '2', label: '2 Stunden' },
  { value: '4', label: '4 Stunden' },
  { value: '8', label: '8 Stunden' },
  { value: '24', label: '24 Stunden' },
  { value: 'never', label: 'Nie (nicht empfohlen)' },
];

export default function AdminSecurity() {
  const { isAdmin, loading } = useAuth();
  const [value, setValue] = useState<string>('8');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'session_timeout_hours').maybeSingle()
      .then(({ data }) => {
        const v = data?.value;
        if (v === null || v === 'never') setValue('never');
        else if (v !== undefined) setValue(String(v));
        setLoaded(true);
      });
  }, []);

  if (loading) return <AppLayout><div className="p-8 text-xs text-muted-foreground">Laden…</div></AppLayout>;
  if (!isAdmin) return <Navigate to="/" replace />;

  const save = async () => {
    setSaving(true);
    const payload = value === 'never' ? 'never' : Number(value);
    const { error } = await supabase.from('system_settings')
      .upsert({ key: 'session_timeout_hours', value: payload as any, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) toast.error('Speichern fehlgeschlagen: ' + error.message);
    else toast.success('Einstellung gespeichert');
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Sicherheit</h1>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Session-Timeout</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Nutzer werden nach dieser Inaktivitätszeit automatisch ausgeloggt. 15 Minuten vor Ablauf erscheint eine Warnung.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Inaktivitätszeit</Label>
            <Select value={value} onValueChange={setValue} disabled={!loaded}>
              <SelectTrigger className="w-full max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2">
            <Button onClick={save} disabled={saving || !loaded}>Speichern</Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

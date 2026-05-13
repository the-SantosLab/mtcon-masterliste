import { useEffect, useMemo, useState } from 'react';
import { CrmLayout } from '@/components/CrmLayout';
import { CrmSettingsTabs } from '@/components/crm/CrmSettingsTabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Loader2, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

type Profile = {
  id: string;
  display_name: string | null;
  short_code: string | null;
  avatar_url?: string | null;
};
type Row = Profile & { role: 'staff' | 'viewer'; access?: { granted_at: string; is_active: boolean } };

const initials = (name?: string | null) =>
  (name || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

export default function CrmAccess() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => { if (!authLoading && isAdmin) void load(); }, [authLoading, isAdmin]);

  const load = async () => {
    setLoading(true);
    const [{ data: roles }, { data: profiles }, { data: access }] = await Promise.all([
      supabase.from('user_roles').select('user_id, role').in('role', ['staff', 'viewer']),
      supabase.from('users_profile').select('id, display_name, short_code, avatar_url, active'),
      supabase.from('crm_access' as any).select('user_id, granted_at, is_active'),
    ]);
    const accessMap = new Map((access ?? []).map((a: any) => [a.user_id, a]));
    const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));
    const list: Row[] = (roles ?? [])
      .map((r: any) => {
        const p = profileMap.get(r.user_id);
        if (!p || (p as any).active === false) return null;
        return {
          id: p.id,
          display_name: p.display_name,
          short_code: p.short_code,
          avatar_url: (p as any).avatar_url,
          role: r.role,
          access: accessMap.get(r.user_id) as any,
        };
      })
      .filter(Boolean) as Row[];
    list.sort((a, b) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
    setRows(list);
    setLoading(false);
  };

  const toggle = async (row: Row, on: boolean) => {
    setBusy(b => ({ ...b, [row.id]: true }));
    // optimistic
    setRows(prev => prev.map(r => r.id === row.id
      ? { ...r, access: on ? { granted_at: new Date().toISOString(), is_active: true } : { ...(r.access ?? { granted_at: new Date().toISOString() }), is_active: false } }
      : r));
    let error: any = null;
    if (on) {
      const { data: auth } = await supabase.auth.getUser();
      const payload: any = { user_id: row.id, granted_by: auth.user?.id, is_active: true, granted_at: new Date().toISOString() };
      const res = await supabase.from('crm_access' as any).upsert(payload, { onConflict: 'user_id' });
      error = res.error;
    } else {
      const res = await supabase.from('crm_access' as any).update({ is_active: false }).eq('user_id', row.id);
      error = res.error;
    }
    setBusy(b => ({ ...b, [row.id]: false }));
    if (error) {
      toast.error('Aktion fehlgeschlagen: ' + error.message);
      void load();
      return;
    }
    toast.success(on
      ? `${row.display_name ?? 'Benutzer'} hat jetzt Zugang zum CRM`
      : `${row.display_name ?? 'Benutzer'} wurde der CRM-Zugang entzogen`);
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/crm/settings" replace />;

  return (
    <CrmLayout>
      <h1 className="text-xl font-semibold text-foreground mb-1">Einstellungen</h1>
      <CrmSettingsTabs />

      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">CRM-Zugang verwalten</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Lege fest welche Mitarbeiter das CRM-Modul sehen und nutzen können.</p>
      </div>

      <div className="flex items-start gap-2 p-3 rounded border border-primary/30 bg-primary/5 mb-4 text-xs text-foreground">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p>Admins haben automatisch Zugang zum CRM und erscheinen nicht in dieser Liste.</p>
      </div>

      <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
        {loading ? (
          <div className="py-12 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground px-6">
            Keine weiteren Mitarbeiter vorhanden. Neue Mitarbeiter können unter Einstellungen → Benutzer angelegt werden.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium w-10"></th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Rolle</th>
                <th className="px-3 py-2 font-medium">Seit</th>
                <th className="px-3 py-2 font-medium text-right">Zugang</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const active = !!r.access?.is_active;
                return (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-2">
                      <div className="h-7 w-7 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                        {initials(r.display_name)}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground">{r.display_name ?? '–'}<span className="text-muted-foreground ml-1.5">{r.short_code ? `· ${r.short_code}` : ''}</span></td>
                    <td className="px-3 py-2 capitalize text-muted-foreground">{r.role}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {active && r.access?.granted_at ? format(new Date(r.access.granted_at), 'dd.MM.yyyy', { locale: de }) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Switch
                        checked={active}
                        disabled={busy[r.id]}
                        onCheckedChange={v => toggle(r, v)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </CrmLayout>
  );
}

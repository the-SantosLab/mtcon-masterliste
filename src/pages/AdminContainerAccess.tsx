import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Loader2, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';

// Module keys = href used in Container3D satellites
const MODULES: { key: string; label: string }[] = [
  { key: '/mtiq/drafts', label: 'MTIQ Posteingang' },
  { key: '/insurance', label: 'Versicherungen' },
  { key: '/ghv', label: 'GHV (Geheimhaltungserklärungen)' },
  { key: '/bestellungen', label: 'Bestellungen' },
  { key: '/documents', label: 'Dokumente' },
  { key: '/issos', label: 'ISSOS (APS-Delta)' },
  { key: '/inbox/documents', label: 'Inbox Archiv' },
];

type Profile = { id: string; display_name: string | null; short_code: string | null; active?: boolean };
type Block = { user_id: string; module_key: string };

const initials = (n?: string | null) =>
  (n || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

export default function AdminContainerAccess() {
  const { isAdmin, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());

  useEffect(() => { if (!authLoading && isAdmin) void load(); }, [authLoading, isAdmin]);

  const load = async () => {
    setLoading(true);
    const [{ data: profs }, { data: bl }, { data: roles }] = await Promise.all([
      supabase.from('users_profile').select('id, display_name, short_code, active'),
      (supabase as any).from('container_module_blocks').select('user_id, module_key'),
      supabase.from('user_roles').select('user_id, role').eq('role', 'admin'),
    ]);
    const admins = new Set((roles ?? []).map((r: any) => r.user_id));
    setAdminIds(admins);
    const list = (profs ?? [])
      .filter((p: any) => p.active !== false && !admins.has(p.id))
      .sort((a: any, b: any) => (a.display_name ?? '').localeCompare(b.display_name ?? ''));
    setProfiles(list as Profile[]);
    setBlocks((bl ?? []) as Block[]);
    setLoading(false);
  };

  const isBlocked = (uid: string, mk: string) =>
    blocks.some(b => b.user_id === uid && b.module_key === mk);

  const toggle = async (uid: string, mk: string, block: boolean) => {
    const k = `${uid}::${mk}`;
    setBusy(b => ({ ...b, [k]: true }));
    // optimistic
    setBlocks(prev => block
      ? [...prev, { user_id: uid, module_key: mk }]
      : prev.filter(b => !(b.user_id === uid && b.module_key === mk)));
    let error: any = null;
    if (block) {
      const { data: auth } = await supabase.auth.getUser();
      const res = await (supabase as any).from('container_module_blocks').upsert(
        { user_id: uid, module_key: mk, blocked_by: auth.user?.id },
        { onConflict: 'user_id,module_key' }
      );
      error = res.error;
    } else {
      const res = await (supabase as any).from('container_module_blocks')
        .delete()
        .eq('user_id', uid)
        .eq('module_key', mk);
      error = res.error;
    }
    setBusy(b => ({ ...b, [k]: false }));
    if (error) {
      toast.error('Fehler: ' + error.message);
      void load();
    } else {
      toast.success(block ? 'Zugang gesperrt' : 'Zugang freigegeben');
    }
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-xl font-semibold text-foreground mb-1">Container-Zugriff</h1>
        <p className="text-xs text-muted-foreground mb-4">
          Lege fest, welche Kacheln im 3D-Container für welchen Mitarbeiter sichtbar sind.
          Schalter aktiv = Kachel ist gesperrt.
        </p>

        <div className="flex items-start gap-2 p-3 rounded border border-primary/30 bg-primary/5 mb-4 text-xs text-foreground">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p>
            Admins haben immer Zugang und erscheinen nicht in der Liste.
            Hinweis: Die Sperre wirkt im Container-UI. Direktaufruf der URL ist weiterhin möglich,
            sofern dort keine eigene Berechtigung greift.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card/40 backdrop-blur-xl overflow-hidden">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-4 w-4 animate-spin inline text-muted-foreground" /></div>
          ) : profiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">Keine Mitarbeiter vorhanden.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium sticky left-0 bg-muted/30 z-10">Mitarbeiter</th>
                    {MODULES.map(m => (
                      <th key={m.key} className="px-3 py-2 font-medium text-center whitespace-nowrap">{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {profiles.map(p => (
                    <tr key={p.id} className="border-t border-border/40">
                      <td className="px-3 py-2 sticky left-0 bg-card/60 z-10">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/15 text-primary text-[10px] font-semibold flex items-center justify-center">
                            {initials(p.display_name)}
                          </div>
                          <div>
                            <div className="text-foreground">{p.display_name ?? '–'}</div>
                            {p.short_code && <div className="text-[10px] text-muted-foreground">{p.short_code}</div>}
                          </div>
                        </div>
                      </td>
                      {MODULES.map(m => {
                        const k = `${p.id}::${m.key}`;
                        const blocked = isBlocked(p.id, m.key);
                        return (
                          <td key={m.key} className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {blocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                              <Switch
                                checked={blocked}
                                disabled={busy[k]}
                                onCheckedChange={v => toggle(p.id, m.key, v)}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

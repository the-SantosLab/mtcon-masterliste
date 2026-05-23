import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';
import { Activity, Circle, MoonStar, PowerOff, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

// Schwellen
const ACTIVE_MS = 2 * 60 * 1000;     // < 2 Min seit letzter Interaktion = aktiv
const ONLINE_MS = 2 * 60 * 1000;     // < 2 Min seit letztem Heartbeat = Session lebt
const SESSION_MS = 15 * 60 * 1000;   // < 15 Min seit letztem Heartbeat = inaktiv (Sitzung steht noch)

type PresenceRow = {
  user_id: string;
  last_seen_at: string;
  last_active_at: string;
  current_path: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  short_code: string | null;
  avatar_url: string | null;
  active: boolean;
};

type Bucket = 'active' | 'online' | 'idle' | 'offline';

interface Entry {
  profile: ProfileRow;
  presence?: PresenceRow;
  bucket: Bucket;
  ageMs: number;
}

const BUCKET_META: Record<Bucket, { label: string; icon: typeof Circle; dot: string; ring: string }> = {
  active:  { label: 'Aktiv arbeitend',     icon: Activity,  dot: 'bg-emerald-500',  ring: 'ring-emerald-500/40' },
  online:  { label: 'Eingeloggt',          icon: Circle,    dot: 'bg-sky-500',      ring: 'ring-sky-500/30' },
  idle:    { label: 'Inaktiv (Sitzung aktiv)', icon: MoonStar, dot: 'bg-amber-500', ring: 'ring-amber-500/30' },
  offline: { label: 'Ausgeloggt',          icon: PowerOff,  dot: 'bg-muted-foreground/50', ring: 'ring-border' },
};

function formatAge(ms: number): string {
  if (ms < 60_000) return 'gerade eben';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tg`;
}

function classify(presence: PresenceRow | undefined, now: number): { bucket: Bucket; ageMs: number } {
  if (!presence) return { bucket: 'offline', ageMs: Infinity };
  const seenAge = now - new Date(presence.last_seen_at).getTime();
  const activeAge = now - new Date(presence.last_active_at).getTime();
  if (seenAge > SESSION_MS) return { bucket: 'offline', ageMs: seenAge };
  if (activeAge < ACTIVE_MS && seenAge < ONLINE_MS) return { bucket: 'active', ageMs: activeAge };
  if (seenAge < ONLINE_MS) return { bucket: 'online', ageMs: seenAge };
  return { bucket: 'idle', ageMs: seenAge };
}

export function MasterControlPanel() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceRow>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: p }, { data: pr }] = await Promise.all([
        supabase.from('users_profile').select('id, display_name, short_code, avatar_url, active').eq('active', true),
        supabase.from('user_presence').select('user_id, last_seen_at, last_active_at, current_path'),
      ]);
      if (cancelled) return;
      setProfiles((p as ProfileRow[] | null) ?? []);
      const map: Record<string, PresenceRow> = {};
      (pr ?? []).forEach((r: PresenceRow) => { map[r.user_id] = r; });
      setPresence(map);
    };
    void load();

    const channel = supabase
      .channel('master-control-presence')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (payload) => {
        const row = (payload.new ?? payload.old) as PresenceRow | undefined;
        if (!row?.user_id) return;
        if (payload.eventType === 'DELETE') {
          setPresence(prev => { const n = { ...prev }; delete n[row.user_id]; return n; });
        } else {
          setPresence(prev => ({ ...prev, [row.user_id]: payload.new as PresenceRow }));
        }
      })
      .subscribe();

    const tick = setInterval(() => setNow(Date.now()), 15_000);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, []);

  const entries: Entry[] = useMemo(() => {
    return profiles.map(profile => {
      const pres = presence[profile.id];
      const { bucket, ageMs } = classify(pres, now);
      return { profile, presence: pres, bucket, ageMs };
    });
  }, [profiles, presence, now]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, Entry[]> = { active: [], online: [], idle: [], offline: [] };
    entries.forEach(e => g[e.bucket].push(e));
    (Object.keys(g) as Bucket[]).forEach(k => g[k].sort((a, b) => a.ageMs - b.ageMs));
    return g;
  }, [entries]);

  const counts = { active: grouped.active.length, online: grouped.online.length, idle: grouped.idle.length, offline: grouped.offline.length };

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Master-Control-Panel</h2>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 ml-1">Echtzeit-Status aller Nutzer</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular-nums">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{counts.active} aktiv</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{counts.online} online</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{counts.idle} inaktiv</span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />{counts.offline} offline</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-px bg-border/40">
        {(['active', 'online', 'idle', 'offline'] as Bucket[]).map(bucket => {
          const meta = BUCKET_META[bucket];
          const Icon = meta.icon;
          const list = grouped[bucket];
          return (
            <div key={bucket} className="bg-card p-3 min-h-[160px]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('h-3.5 w-3.5', bucket === 'active' && 'text-emerald-500', bucket === 'online' && 'text-sky-500', bucket === 'idle' && 'text-amber-500', bucket === 'offline' && 'text-muted-foreground')} />
                  <span className="text-xs font-medium text-foreground">{meta.label}</span>
                </div>
                <span className="text-[11px] text-muted-foreground tabular-nums">{list.length}</span>
              </div>
              {list.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 italic">Niemand</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map(e => (
                    <li key={e.profile.id} className="flex items-center gap-2 group">
                      <div className={cn('relative rounded-full ring-2', meta.ring)}>
                        <UserAvatar user={{ display_name: e.profile.display_name ?? '', short_code: e.profile.short_code ?? '', avatar_url: e.profile.avatar_url ?? null }} size="sm" />
                        <span className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card', meta.dot)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground truncate">{e.profile.display_name || e.profile.short_code}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {bucket === 'offline'
                            ? (e.presence ? `zuletzt ${formatAge(e.ageMs)}` : 'noch nie eingeloggt')
                            : bucket === 'active' && e.presence?.current_path
                              ? e.presence.current_path
                              : formatAge(e.ageMs)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

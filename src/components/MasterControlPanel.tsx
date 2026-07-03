import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserAvatar } from '@/components/UserAvatar';
import { Activity, Circle, LogOut, MoonStar, PowerOff, Radio, Search, Loader2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EmployeeDetailDialog } from '@/components/TeamAttendanceOverview';

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
type Filter = 'all' | Bucket;

interface Entry {
  profile: ProfileRow;
  presence?: PresenceRow;
  bucket: Bucket;
  ageMs: number;
}

const BUCKET_META: Record<Bucket, {
  label: string;
  short: string;
  icon: typeof Circle;
  dot: string;
  text: string;
  ring: string;
  bg: string;
  bar: string;
}> = {
  active:  { label: 'Aktiv arbeitend',   short: 'Aktiv',   icon: Activity,  dot: 'bg-emerald-500',          text: 'text-emerald-500',         ring: 'ring-emerald-500/40',   bg: 'bg-emerald-500/10',          bar: 'bg-emerald-500' },
  online:  { label: 'Eingeloggt',        short: 'Online',  icon: Circle,    dot: 'bg-sky-500',              text: 'text-sky-500',             ring: 'ring-sky-500/30',       bg: 'bg-sky-500/10',              bar: 'bg-sky-500' },
  idle:    { label: 'Inaktiv',           short: 'Inaktiv', icon: MoonStar,  dot: 'bg-amber-500',            text: 'text-amber-500',           ring: 'ring-amber-500/30',     bg: 'bg-amber-500/10',            bar: 'bg-amber-500' },
  offline: { label: 'Ausgeloggt',        short: 'Offline', icon: PowerOff,  dot: 'bg-muted-foreground/50',  text: 'text-muted-foreground',    ring: 'ring-border',           bg: 'bg-muted/40',                bar: 'bg-muted-foreground/40' },
};

function formatAge(ms: number): string {
  if (!isFinite(ms)) return '—';
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
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [presence, setPresence] = useState<Record<string, PresenceRow>>({});
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [logoutTarget, setLogoutTarget] = useState<Entry | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [personioTarget, setPersonioTarget] = useState<ProfileRow | null>(null);
  const [personioAtt, setPersonioAtt] = useState<any[]>([]);
  const [personioAbs, setPersonioAbs] = useState<any[]>([]);
  const [personioLoading, setPersonioLoading] = useState(false);
  const personioLoadedRef = useRef(false);

  const openPersonio = async (profile: ProfileRow) => {
    setPersonioTarget(profile);
    if (personioLoadedRef.current) return;
    setPersonioLoading(true);
    try {
      const from = `${new Date().getFullYear() - 1}-01-01`;
      const to = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const [a, ab] = await Promise.all([
        supabase.from('personio_attendances')
          .select('user_id, work_date, start_time, end_time, worked_minutes')
          .gte('work_date', from).lte('work_date', to),
        supabase.from('personio_absences')
          .select('user_id, category, absence_type, start_date, end_date, days_count')
          .gte('end_date', from).lte('start_date', to),
      ]);
      setPersonioAtt(a.data ?? []);
      setPersonioAbs(ab.data ?? []);
      personioLoadedRef.current = true;
    } catch (e) {
      toast({ title: 'Fehler', description: 'Personio-Daten konnten nicht geladen werden.', variant: 'destructive' });
    } finally {
      setPersonioLoading(false);
    }
  };

  const handleForceLogout = async () => {
    if (!logoutTarget) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.functions.invoke('force-logout-user', {
        body: { user_id: logoutTarget.profile.id },
      });
      if (error) throw error;
      toast({ title: 'Nutzer ausgeloggt', description: `${logoutTarget.profile.display_name ?? logoutTarget.profile.short_code} wurde abgemeldet.` });
      setPresence(prev => { const n = { ...prev }; delete n[logoutTarget.profile.id]; return n; });
      setLogoutTarget(null);
    } catch (e) {
      toast({ title: 'Fehler', description: (e as Error).message ?? 'Logout fehlgeschlagen.', variant: 'destructive' });
    } finally {
      setLoggingOut(false);
    }
  };

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

  const counts = useMemo(() => {
    const c = { active: 0, online: 0, idle: 0, offline: 0 } as Record<Bucket, number>;
    entries.forEach(e => { c[e.bucket]++; });
    return c;
  }, [entries]);

  const total = profiles.length || 1;
  const reachable = counts.active + counts.online + counts.idle;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: Record<Bucket, number> = { active: 0, online: 1, idle: 2, offline: 3 };
    return entries
      .filter(e => filter === 'all' || e.bucket === filter)
      .filter(e => {
        if (!q) return true;
        return (e.profile.display_name ?? '').toLowerCase().includes(q)
          || (e.profile.short_code ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
        return a.ageMs - b.ageMs;
      });
  }, [entries, filter, query]);

  const TABS: { key: Filter; label: string; count: number; dot?: string }[] = [
    { key: 'all',     label: 'Alle',     count: profiles.length },
    { key: 'active',  label: 'Aktiv',    count: counts.active,  dot: BUCKET_META.active.bar },
    { key: 'online',  label: 'Online',   count: counts.online,  dot: BUCKET_META.online.bar },
    { key: 'idle',    label: 'Inaktiv',  count: counts.idle,    dot: BUCKET_META.idle.bar },
    { key: 'offline', label: 'Offline',  count: counts.offline, dot: BUCKET_META.offline.bar },
  ];

  return (
    <section className="glass-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-sm font-medium text-foreground">Master-Control-Panel</h2>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <Radio className="h-3 w-3" /> Live
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          <span className="text-foreground font-medium">{reachable}</span> von {profiles.length} erreichbar
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/40">
        {(['active', 'online', 'idle', 'offline'] as Bucket[]).map(b => {
          const meta = BUCKET_META[b];
          const Icon = meta.icon;
          const pct = Math.round((counts[b] / total) * 100);
          return (
            <button
              key={b}
              type="button"
              onClick={() => setFilter(filter === b ? 'all' : b)}
              className={cn(
                'group bg-card p-3 text-left transition-colors',
                'hover:bg-muted/30 focus:outline-none focus:bg-muted/30',
                filter === b && 'bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={cn('flex items-center gap-1.5 px-1.5 py-0.5 rounded-md', meta.bg)}>
                  <Icon className={cn('h-3 w-3', meta.text)} />
                  <span className={cn('text-[10px] uppercase tracking-wider font-medium', meta.text)}>{meta.short}</span>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-2xl font-semibold text-foreground tabular-nums leading-none">{counts[b]}</span>
                <span className="text-[10px] text-muted-foreground">/ {profiles.length}</span>
              </div>
              <div className="h-1 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', meta.bar)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Toolbar: Filter Tabs + Search */}
      <div className="px-3 py-2.5 border-y border-border/50 flex items-center gap-2 flex-wrap bg-card/60">
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-md border transition-colors tabular-nums',
                filter === t.key
                  ? 'bg-foreground/5 border-border text-foreground'
                  : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30',
              )}
            >
              {t.dot && <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />}
              <span>{t.label}</span>
              <span className="text-muted-foreground/70">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nutzer suchen…"
            className="h-7 pl-7 text-[11px] bg-background/40"
          />
        </div>
      </div>

      {/* Grid of users */}
      <div className="p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-[11px] text-muted-foreground">
            Keine Nutzer in dieser Auswahl.
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
            {filtered.map(e => {
              const meta = BUCKET_META[e.bucket];
              const sub = e.bucket === 'offline'
                ? (e.presence ? `zuletzt ${formatAge(e.ageMs)}` : 'noch nie eingeloggt')
                : e.bucket === 'active' && e.presence?.current_path
                  ? e.presence.current_path
                  : formatAge(e.ageMs);
              return (
                <li
                  key={e.profile.id}
                  className={cn(
                    'group flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-border/50 bg-card/60',
                    'hover:bg-muted/30 hover:border-border transition-colors',
                  )}
                  title={e.presence?.current_path ? `Aktuell: ${e.presence.current_path}` : undefined}
                >
                  <div className={cn('relative rounded-full ring-2 shrink-0', meta.ring)}>
                    <UserAvatar
                      user={{
                        display_name: e.profile.display_name ?? '',
                        short_code: e.profile.short_code ?? '',
                        avatar_url: e.profile.avatar_url ?? null,
                      }}
                      size="sm"
                    />
                    <span className={cn('absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-card', meta.dot)}>
                      {e.bucket === 'active' && (
                        <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 animate-ping" />
                      )}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-foreground truncate">
                        {e.profile.display_name || e.profile.short_code}
                      </p>
                      {e.profile.short_code && e.profile.display_name && (
                        <span className="text-[9px] text-muted-foreground/70 tabular-nums shrink-0">
                          {e.profile.short_code}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
                  </div>
                  <span className={cn('text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded shrink-0', meta.bg, meta.text)}>
                    {meta.short}
                  </span>
                  {e.bucket !== 'offline' && e.profile.id !== currentUser?.id && (
                    <button
                      type="button"
                      onClick={() => setLogoutTarget(e)}
                      title="Nutzer ausloggen"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <LogOut className="h-3 w-3" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!logoutTarget} onOpenChange={(o) => !o && setLogoutTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nutzer ausloggen?</AlertDialogTitle>
            <AlertDialogDescription>
              {logoutTarget && (
                <>
                  Alle aktiven Sitzungen von{' '}
                  <span className="font-medium text-foreground">
                    {logoutTarget.profile.display_name || logoutTarget.profile.short_code}
                  </span>{' '}
                  werden sofort beendet. Der Nutzer muss sich neu anmelden.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loggingOut}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => { ev.preventDefault(); void handleForceLogout(); }}
              disabled={loggingOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Ausloggen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

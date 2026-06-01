import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isMasterUser } from '@/lib/master-users';
import { usePreferences } from '@/contexts/PreferencesContext';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';
import { MfaReminderBanner } from '@/components/MfaReminderBanner';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, ClipboardList, Settings, Users, Database,
  LogOut, Menu, X, ChevronDown, Sun, Moon, Building2, AlignJustify, AlignLeft,
  FolderKanban, BookOpen, Search, KeyRound, Loader2, Eye, EyeOff, RefreshCw, Headphones, Workflow, DatabaseBackup, Package, Trash2, FileText, ShieldCheck, StickyNote, Megaphone, Inbox, Sparkles, Bug, FolderArchive,
} from 'lucide-react';
import { BugReportDialog } from '@/components/BugReportDialog';

import mtconLogo from '@/assets/mtcon_logo.png';
import mtconErpLabel from '@/assets/mtcon-erp-label.png';
import mtconErpLabelLight from '@/assets/mtcon-erp-label-light.png';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrmAccess } from '@/hooks/useCrmAccess';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { MtiqWidget } from '@/components/mtiq/MtiqWidget';

function CrmModuleLink({ linkClass, onClose }: { linkClass: (h: string) => string; onClose: () => void }) {
  const { allowed } = useCrmAccess();
  if (!allowed) return null;
  return (
    <>
      <div className="border-t border-sidebar-border my-1" />
      <Link to="/modules" onClick={onClose} className={linkClass('/modules')}>
        <RefreshCw className="h-4 w-4" />Module wechseln
      </Link>
    </>
  );
}

function MtiqPendingBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { count: c } = await (supabase as any)
        .from('mtiq_drafts')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (!cancelled) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel('mtiq-drafts-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mtiq_drafts' }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);
  if (count === 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
      {count}
    </span>
  );
}

function CasesUnreadBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = async () => {
      // Fetch all accessible case ids (RLS restricts to visible ones)
      const { data: cs, error: csErr } = await supabase
        .from('cases')
        .select('id')
        .eq('deleted', false)
        .limit(1000);
      if (csErr || !cs?.length) { if (!cancelled) setCount(0); return; }
      const ids = cs.map((c: any) => c.id);
      const { data, error } = await (supabase as any).rpc('get_case_chat_unread', { p_case_ids: ids });
      if (error) { if (!cancelled) setCount(0); return; }
      const total = ((data as any[]) || []).reduce((s, r) => s + (r.unread_count || 0), 0);
      if (!cancelled) setCount(total);
    };

    load();
    const ch = supabase
      .channel(`sidebar-cases-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_reads', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  if (count === 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold tabular-nums leading-none">
      {count > 99 ? '99+' : count}
    </span>
  );
}


interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases/kanban', label: 'Kanban', icon: ClipboardList },
  { href: '/cases', label: 'Vorgänge', icon: ClipboardList },

  { href: '/projects', label: 'Vorgänge +/Projekte', icon: FolderKanban },
  { href: '/inbox', label: 'Posteingang', icon: Inbox, mtiq: true },
  { href: '/notes', label: 'Notizen', icon: StickyNote },
  { href: '/support', label: 'Support', icon: Headphones },
  
  { href: '/docs', label: 'Dokumentation', icon: BookOpen },
];
const adminItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Mitarbeiter', icon: Users },
  { href: '/admin/departments', label: 'Abteilungen', icon: Building2 },
  { href: '/admin/master-data', label: 'Stammdaten', icon: Database },
  { href: '/admin/templates', label: 'Vorlagen', icon: FileText },
  { href: '/admin/announcements', label: 'Mitteilungen', icon: Megaphone },
  { href: '/products/requests', label: 'Produktvorschläge', icon: Package },
  { href: '/admin/workflows', label: 'Workflows', icon: Workflow },
  { href: '/admin/ai-prompts', label: 'KI-Prompts', icon: Sparkles },
  { href: '/admin/document-types', label: 'Dokumenttypen', icon: FileText },
  { href: '/admin/action-rules', label: 'Aktions-Regeln', icon: Workflow },
  { href: '/admin/inbox-stats', label: 'Inbox-Statistik', icon: LayoutDashboard },
  { href: '/admin/security', label: 'Sicherheit', icon: ShieldCheck },
  { href: '/admin/backups', label: 'Backups', icon: DatabaseBackup },
  { href: '/admin/deleted-cases', label: 'Gelöschte Vorgänge', icon: Trash2 },
  { href: '/admin/papierkorb', label: 'Papierkorb', icon: Trash2, masterOnly: true },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role, signOut, isAdmin, user } = useAuth();
  const isMaster = isMasterUser(user?.id);
  const { preferences, setTheme, setCompactTables } = usePreferences();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  usePresenceHeartbeat();

  const handleChangePassword = async () => {
    if (!newPw || newPw.length < 8) { toast.error('Neues Passwort muss mindestens 8 Zeichen lang sein'); return; }
    if (newPw !== newPwConfirm) { toast.error('Passwörter stimmen nicht überein'); return; }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      toast.success('Passwort wurde geändert');
      setPwDialogOpen(false);
      setOldPw(''); setNewPw(''); setNewPwConfirm(''); setPwShowNew(false);
    } catch (err: any) {
      toast.error(err.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setPwLoading(false);
    }
  };

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const active = (href: string) => {
    if (href === '/') return location.pathname === '/';
    if (href === '/cases') {
      if (location.pathname.startsWith('/cases/kanban')) return false;
      return location.pathname === '/cases' || /^\/cases\/[^\/]+$/.test(location.pathname);
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const linkClass = (href: string) => cn(
    'relative flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all duration-150 ease-out',
    active(href)
      ? 'bg-primary/15 text-foreground font-semibold border-l-[3px] border-primary pl-[calc(0.75rem-3px)]'
      : 'text-sidebar-foreground font-normal hover:text-foreground hover:bg-sidebar-accent/60',
  );

  const isDark = preferences.theme === 'dark';
  const isCompact = preferences.compactTables;

  return (
    <div className="flex h-screen overflow-hidden bg-background glass-bg">
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {open && <div className="fixed inset-0 bg-foreground/10 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-56 flex flex-col glass-sidebar transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2 px-3 h-14 border-b border-sidebar-border shrink-0">
          <div className="h-10 w-10 flex items-center justify-center shrink-0">
            <img src={mtconLogo} alt="MTCON Logo" className="h-10 w-10 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-tight">Masterliste</p>
            <p className="text-[8px] text-muted-foreground/60 tracking-widest uppercase">v1.5</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {/* Search trigger */}
          <button
            onClick={() => setCmdOpen(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors mb-1"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Suche</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-sidebar-border px-1 py-0.5 text-[9px] font-mono text-muted-foreground">⌘K</kbd>
          </button>
          <div className="border-t border-sidebar-border my-1" />
          {navItems.map(item => (
            <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={linkClass(item.href)}>
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {(item as any).mtiq && <MtiqPendingBadge />}
              {item.href === '/cases' && <CasesUnreadBadge />}
            </Link>
          ))}
          <Link to="/container" onClick={() => setOpen(false)} className={linkClass('/container')}>
            <FolderArchive className="h-4 w-4" />
            <span className="flex-1">3D Container</span>
          </Link>
          <Link to="/orders" onClick={() => setOpen(false)} className={linkClass('/orders')}>
            <Package className="h-4 w-4" />
            <span className="flex-1">Bestellungen</span>
          </Link>
          <CrmModuleLink linkClass={linkClass} onClose={() => setOpen(false)} />

          {isAdmin && (
            <>
              <div className="border-t border-sidebar-border my-1" />
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
              >
                <Settings className="h-4 w-4" />Verwaltung
                <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', adminOpen && 'rotate-180')} />
              </button>
              {adminOpen && adminItems.filter(i => !(i as any).masterOnly || isMaster).map(item => (
                <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={cn(linkClass(item.href), 'pl-9')}>
                  <item.icon className="h-4 w-4" />{item.label}
                </Link>
              ))}
            </>
          )}
          <div className="border-t border-sidebar-border my-1" />
          <button
            onClick={() => setBugDialogOpen(true)}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
          >
            <Bug className="h-4 w-4" />
            <span className="flex-1 text-left">Bug / Feedback melden</span>
          </button>
          <Link to="/feedback" onClick={() => setOpen(false)} className={cn(linkClass('/feedback'), 'pl-9 text-[12px]')}>
            <span>Meine Meldungen</span>
          </Link>
        </nav>

        <div className="px-4 pb-3 pt-1 shrink-0 flex items-center justify-between gap-2">
          <img
            src={isDark ? mtconErpLabel : mtconErpLabelLight}
            alt="MTCON goes ERP"
            className="w-full max-w-[120px] h-auto opacity-90"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              title={isDark ? 'Hell-Modus' : 'Dunkel-Modus'}
              className="h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
            >
              {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <button
              type="button"
              onClick={() => setCompactTables(!isCompact)}
              title={isCompact ? 'Tabellen normal' : 'Tabellen kompakt'}
              className={cn(
                'h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors',
                isCompact && 'text-foreground'
              )}
            >
              {isCompact ? <AlignJustify className="h-[18px] w-[18px]" /> : <AlignLeft className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </div>

        <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full rounded px-1 py-1 hover:bg-sidebar-accent/60 transition-colors">
                <UserAvatar
                  user={profile ? { id: profile.id, display_name: profile.display_name, short_code: profile.short_code, avatar_url: (profile as any).avatar_url } : null}
                  size="md"
                  tooltip={false}
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">{profile?.display_name || '–'}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{role || '–'}</p>
                </div>
                <ChevronDown className="h-[18px] w-[18px] text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 mb-1 text-xs">
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground font-medium">Darstellung</div>
              <DropdownMenuItem
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="gap-2 text-xs cursor-pointer"
              >
                {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {isDark ? 'Hell-Modus' : 'Dunkel-Modus'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setCompactTables(!isCompact)}
                className="gap-2 text-xs cursor-pointer"
              >
                {isCompact ? <AlignJustify className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
                {isCompact ? 'Tabellen normal' : 'Tabellen kompakt'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="gap-2 text-xs cursor-pointer">
                <Link to="/profile"><Users className="h-3.5 w-3.5" />Mein Profil</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setPwDialogOpen(true)}
                className="gap-2 text-xs cursor-pointer"
              >
                <KeyRound className="h-3.5 w-3.5" />Passwort ändern
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="gap-2 text-xs text-destructive cursor-pointer">
                <LogOut className="h-3.5 w-3.5" />Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative z-[1]">
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 glass-header shrink-0 relative z-[100]">
          <button onClick={() => setOpen(true)}><Menu className="h-5 w-5 text-foreground" /></button>
          <span className="text-sm font-semibold text-foreground flex-1">Masterliste</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={() => setCmdOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted/60">
              <Search className="h-5 w-5" />
            </button>
          </div>
        </header>
        {/* Desktop header bar with notifications */}
        <header className="hidden lg:flex items-center justify-end gap-2 px-6 h-12 glass-header shrink-0 relative z-[100]">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 relative z-[1]"><MfaReminderBanner />{children}</main>
        
      </div>

      <Dialog open={pwDialogOpen} onOpenChange={o => { if (!o) { setPwDialogOpen(false); setOldPw(''); setNewPw(''); setNewPwConfirm(''); setPwShowNew(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Passwort ändern</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Geben Sie ein neues Passwort ein (mindestens 8 Zeichen).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Neues Passwort</Label>
              <div className="relative">
                <Input
                  type={pwShowNew ? 'text' : 'password'}
                  placeholder="Min. 8 Zeichen"
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  className="h-8 text-xs font-mono pr-8"
                />
                <button
                  type="button"
                  onClick={() => setPwShowNew(v => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {pwShowNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {newPw && newPw.length > 0 && newPw.length < 8 && (
                <p className="text-[11px] text-[hsl(var(--status-rejected))]">Mindestens 8 Zeichen</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Passwort bestätigen</Label>
              <Input
                type={pwShowNew ? 'text' : 'password'}
                placeholder="Passwort wiederholen"
                value={newPwConfirm}
                onChange={e => setNewPwConfirm(e.target.value)}
                className="h-8 text-xs font-mono"
              />
              {newPwConfirm && newPw !== newPwConfirm && (
                <p className="text-[11px] text-[hsl(var(--status-rejected))]">Passwörter stimmen nicht überein</p>
              )}
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={pwLoading || !newPw || newPw.length < 8 || newPw !== newPwConfirm}
              className="w-full h-8 text-xs gap-1.5"
            >
              {pwLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Speichern…</> : 'Passwort ändern'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <MtiqWidget />
      <BugReportDialog open={bugDialogOpen} onOpenChange={setBugDialogOpen} />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLedDepartments } from '@/hooks/useDeptLead';
import { isMasterUser } from '@/lib/master-users';
import { usePreferences } from '@/contexts/PreferencesContext';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';
import { MfaReminderBanner } from '@/components/MfaReminderBanner';
import { supabase } from '@/integrations/supabase/client';
import { useContainerUnread } from '@/hooks/useContainerUnread';
import {
  LayoutDashboard, ClipboardList, Settings, Users, Database,
  LogOut, Menu, X, ChevronDown, Sun, Moon, Building2, AlignJustify, AlignLeft,
  FolderKanban, BookOpen, Search, KeyRound, Loader2, Eye, EyeOff, RefreshCw, Headphones, Workflow, DatabaseBackup, Package, Trash2, FileText, ShieldCheck, StickyNote, Megaphone, Inbox, Sparkles, Bug, FolderArchive, Network, ShoppingCart, Truck, Receipt, Lock, Briefcase, Activity, Calendar, Send, Target, MapPin, CalendarRange, Star, TrendingUp, FolderTree, Globe,
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
import { SortableNavList } from '@/components/SortableNavList';


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

function ContainerUnreadBadge() {
  const { total } = useContainerUnread();
  if (!total) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold tabular-nums leading-none">
      {total > 99 ? '99+' : total}
    </span>
  );
}


interface AppLayoutProps {
  children: React.ReactNode;
}

const mslItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases/kanban', label: 'Kanban', icon: ClipboardList },
  { href: '/cases', label: 'Vorgänge', icon: ClipboardList },
  { href: '/projects', label: 'Projekte / Vorgänge +', icon: FolderKanban },
  { href: '/notes', label: 'Notizen', icon: StickyNote },
];

const navItems: { href: string; label: string; icon: any }[] = [];


const systemItems = [
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
  { href: '/admin/container-access', label: 'Container-Zugriff', icon: Lock },
  { href: '/admin/backups', label: 'Backups', icon: DatabaseBackup },
  { href: '/admin/folder-templates', label: 'Ordner-Vorlagen', icon: FolderTree },
  { href: '/admin/deleted-cases', label: 'Gelöschte Vorgänge', icon: Trash2 },
  { href: '/admin/papierkorb', label: 'Papierkorb', icon: Trash2, masterOnly: true },
];

const crmItems = [
  { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm/deals', label: 'Deals', icon: Briefcase },
  { href: '/crm/companies', label: 'Geschäftspartner', icon: Building2 },
  { href: '/crm/contacts', label: 'Kontakte', icon: Users },
  { href: '/crm/offers', label: 'Angebote', icon: FileText },
  { href: '/crm/activities', label: 'Aktivitäten', icon: Activity },
  { href: '/crm/activities/calendar', label: 'Kalender', icon: Calendar },
  { href: '/crm/analytics', label: 'Auswertungen', icon: TrendingUp },
  { href: '/crm/outbound', label: 'Outbound', icon: Send },
  { href: '/crm/outbound/leads', label: 'Leads', icon: Target },
  { href: '/crm/wiki', label: 'Wiki', icon: BookOpen },
 { href: '/crm/settings/routing', label: 'Auto-Routing', icon: Workflow },
 { href: '/crm/settings/webformulare', label: 'Webformulare', icon: Globe },
 { href: '/crm/settings/microsoft-365', label: 'Microsoft 365', icon: PlugZap },
 { href: '/crm/settings', label: 'Einstellungen', icon: Settings },
];

const erpItems = [
  { href: '/admin/inventory', label: 'Lager', icon: Package },
  { href: '/admin/storage-locations', label: 'Lagerplätze', icon: MapPin },
  { href: '/admin/disposition', label: 'Disposition', icon: Activity },
  { href: '/admin/lots', label: 'Chargen', icon: Package },
  { href: '/admin/sperrlager', label: 'Sperrlager', icon: Lock },
  { href: '/admin/purchasing', label: 'Einkauf', icon: ShoppingCart },
  { href: '/bestellungen', label: 'Bestellungen', icon: ShoppingCart },
  { href: '/lieferscheine', label: 'Lieferscheine', icon: Truck },
  { href: '/rechnungen', label: 'Rechnungen', icon: Receipt },
  { href: '/eingangsrechnungen', label: 'Eingangsrechnungen', icon: Receipt },
  { href: '/reporting/einkauf', label: 'Reporting Einkauf', icon: Receipt },
  { href: '/kapazitaet', label: 'Kapazitätsplan', icon: CalendarRange },
  { href: '/zeichnungen', label: 'Zeichnungen', icon: FileText },
  { href: '/lieferantenbewertung', label: 'Lieferantenbewertung', icon: Star },
  { href: '/preismanagement', label: 'Preismanagement', icon: TrendingUp },
  { href: '/ki-artikel', label: 'KI-Artikelanlage', icon: Sparkles },
  { href: '/admin/articles', label: 'Artikel (ISSOS)', icon: Package },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role, signOut, isAdmin, user } = useAuth();
  const isMaster = isMasterUser(user?.id);
  const { isLead } = useLedDepartments();
  const { preferences, setTheme, setCompactTables, setSidebarCompact } = usePreferences();
  const sidebarCompact = preferences.sidebarCompact;
  const sbText = sidebarCompact ? 'text-sm' : 'text-[15px]';
  const sbPy = sidebarCompact ? 'py-2' : 'py-2.5';
  const sbWidth = sidebarCompact ? 'w-56' : 'w-64';
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));
  const [crmOpen, setCrmOpen] = useState(location.pathname.startsWith('/crm'));
  const [mslOpen, setMslOpen] = useState(
    location.pathname === '/' ||
    location.pathname.startsWith('/cases') ||
    location.pathname.startsWith('/projects') ||
    location.pathname.startsWith('/notes')
  );
  const [erpOpen, setErpOpen] = useState(
    ['/admin/inventory', '/admin/storage-locations', '/admin/disposition', '/admin/lots', '/admin/sperrlager', '/admin/purchasing', '/lieferscheine', '/rechnungen', '/eingangsrechnungen', '/reporting/einkauf', '/kapazitaet', '/zeichnungen', '/lieferantenbewertung', '/preismanagement', '/ki-artikel', '/admin/articles'].some(p => location.pathname.startsWith(p))
  );
  const [systemOpen, setSystemOpen] = useState(
    ['/support', '/docs', '/feedback'].some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
  );
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
    'relative flex items-center gap-2.5 px-3 rounded transition-all duration-150 ease-out',
    sbText, sbPy,
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

      <aside
        data-sidebar-density={sidebarCompact ? 'compact' : 'comfortable'}
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 flex flex-col glass-sidebar transition-transform duration-200',
          sbWidth,
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >


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
          <button
            onClick={() => setMslOpen(!mslOpen)}
            className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
          >
            <ClipboardList className="h-4 w-4" />MSL
            <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', mslOpen && 'rotate-180')} />
          </button>
          {mslOpen && (
            <SortableNavList
              storageKey="mtcon.sidebar.order.msl"
              items={mslItems.map(i => ({ ...i, trailing: i.href === '/cases' ? <CasesUnreadBadge /> : null }))}
              linkClass={linkClass}
              onItemClick={() => setOpen(false)}
              itemClassName="pl-9 !text-xs !py-1 [&>svg]:!h-3.5 [&>svg]:!w-3.5"
            />
          )}
          {navItems.map(item => (
            <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={linkClass(item.href)}>
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
            </Link>
          ))}

          {isAdmin && (
            <>
              <div className="border-t border-sidebar-border my-1" />
              <button
                onClick={() => setErpOpen(!erpOpen)}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
              >
                <Package className="h-4 w-4" />ERP
                <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', erpOpen && 'rotate-180')} />
              </button>
              {erpOpen && (
                <SortableNavList
                  storageKey="mtcon.sidebar.order.erp"
                  items={erpItems}
                  linkClass={linkClass}
                  onItemClick={() => setOpen(false)}
                  itemClassName="pl-9 !text-xs !py-1 [&>svg]:!h-3.5 [&>svg]:!w-3.5"
                />
              )}
            </>
          )}

          {isAdmin && (
            <>
              <div className="border-t border-sidebar-border my-1" />
              <button
                onClick={() => setCrmOpen(!crmOpen)}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
              >
                <Briefcase className="h-4 w-4" />CRM
                <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', crmOpen && 'rotate-180')} />
              </button>
              {crmOpen && (
                <SortableNavList
                  storageKey="mtcon.sidebar.order.crm"
                  items={crmItems}
                  linkClass={linkClass}
                  onItemClick={() => setOpen(false)}
                  itemClassName="pl-9 !text-xs !py-1 [&>svg]:!h-3.5 [&>svg]:!w-3.5"
                />
              )}
            </>
          )}

          <div className="border-t border-sidebar-border my-1" />
          <Link to="/container" onClick={() => setOpen(false)} className={linkClass('/container')}>
            <FolderArchive className="h-4 w-4" />
            <span className="flex-1">3D Container</span>
            <ContainerUnreadBadge />
          </Link>

          {isAdmin && (
            <Link to="/map" onClick={() => setOpen(false)} className={linkClass('/map')}>
              <Network className="h-4 w-4" />
              <span className="flex-1">Business Map</span>
            </Link>
          )}

          {(isAdmin || isLead) && (
            <>
              <div className="border-t border-sidebar-border my-1" />
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
              >
                <Settings className="h-4 w-4" />Verwaltung
                <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', adminOpen && 'rotate-180')} />
              </button>
              {adminOpen && (
                <SortableNavList
                  storageKey="mtcon.sidebar.order.admin"
                  items={adminItems.filter(i => isAdmin ? (!(i as any).masterOnly || isMaster) : i.href === '/admin/departments')}
                  linkClass={linkClass}
                  onItemClick={() => setOpen(false)}
                  itemClassName="pl-9 !text-xs !py-1 [&>svg]:!h-3.5 [&>svg]:!w-3.5"
                />
              )}
            </>
          )}

          <div className="border-t border-sidebar-border my-1" />
          <button
            onClick={() => setSystemOpen(!systemOpen)}
            className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
          >
            <Settings className="h-4 w-4" />System
            <ChevronDown className={cn('h-[18px] w-[18px] ml-auto transition-transform', systemOpen && 'rotate-180')} />
          </button>
          {systemOpen && (
            <>
              <SortableNavList
                storageKey="mtcon.sidebar.order.system"
                items={systemItems.map(i => ({ ...i, trailing: i.href === '/container' ? <ContainerUnreadBadge /> : null }))}
                linkClass={linkClass}
                onItemClick={() => setOpen(false)}
                itemClassName="pl-9 !text-xs !py-1 [&>svg]:!h-3.5 [&>svg]:!w-3.5"
              />
              <button
                onClick={() => setBugDialogOpen(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2 pl-9 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
              >
                <Bug className="h-4 w-4" />
                <span className="flex-1 text-left">Bug / Feedback melden</span>
              </button>
              <Link to="/feedback" onClick={() => setOpen(false)} className={cn(linkClass('/feedback'), 'pl-14 text-[12px]')}>
                <span>Meine Meldungen</span>
              </Link>
            </>
          )}
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
            <button
              type="button"
              onClick={() => setSidebarCompact(!sidebarCompact)}
              title={sidebarCompact ? 'Sidebar groß' : 'Sidebar kompakt'}
              className={cn(
                'h-[18px] w-[18px] flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors',
                !sidebarCompact && 'text-foreground'
              )}
            >
              <span className="font-semibold leading-none tracking-tight"><span className="text-[9px]">a</span><span className="text-[13px]">A</span></span>
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
              <DropdownMenuItem
                onClick={() => setSidebarCompact(!sidebarCompact)}
                className="gap-2 text-xs cursor-pointer"
              >
                <span className="inline-flex items-baseline w-3.5 justify-center font-semibold"><span className="text-[9px]">a</span><span className="text-[12px]">A</span></span>
                {sidebarCompact ? 'Sidebar groß' : 'Sidebar kompakt'}
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
        <main className="erp-shell flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 relative z-[1]"><MfaReminderBanner />{children}</main>
        
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

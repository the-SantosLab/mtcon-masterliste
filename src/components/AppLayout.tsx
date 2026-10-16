import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLedDepartments } from '@/hooks/useDeptLead';
import { useErpAccess } from '@/hooks/useErpAccess';
import { useCrmAccess } from '@/hooks/useCrmAccess';
import { useSidebarNavigation } from '@/hooks/useSidebarNavigation';
import { isMasterUser } from '@/lib/master-users';
import { usePreferences } from '@/contexts/PreferencesContext';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';
import { MfaReminderBanner } from '@/components/MfaReminderBanner';
import { supabase } from '@/integrations/supabase/client';
import { useContainerUnread } from '@/hooks/useContainerUnread';
import {
  LayoutDashboard, ClipboardList, Settings, Users, Database, TerminalSquare,
  LogOut, Menu, X, ChevronDown, Sun, Moon, Building2, AlignJustify, AlignLeft,
  FolderKanban, BookOpen, Search, KeyRound, Loader2, Eye, EyeOff, RefreshCw, Headphones, Workflow, DatabaseBackup, Package, Trash2, FileText, ShieldCheck, StickyNote, Megaphone, Inbox, Sparkles, Bug, FolderArchive, Network, ShoppingCart, Truck, Receipt, Lock, Briefcase, Activity, Calendar, Send, Target, MapPin, CalendarRange, Star, TrendingUp, FolderTree, Globe, PlugZap,
  Wrench, ChevronRight, Trophy, CalendarClock, Mail, Phone, Plus, Upload, Pencil, Check, UserPlus, Kanban,
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
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { MtiqWidget } from '@/components/mtiq/MtiqWidget';
import { MtiqWriter } from '@/components/mtiq/MtiqWriter';
import { PerfPanel, PerfProfiler } from '@/components/PerfPanel';
import { PdfJobToaster } from '@/components/PdfJobToaster';
import { SatisfactionSurveyBanner } from '@/components/SatisfactionSurveyBanner';
import { cachedFetch, getCached } from '@/lib/shellCache';


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
  const cacheKey = `cases-unread-total:${user?.id ?? ''}`;
  const [count, setCount] = useState(() => getCached<number>(cacheKey) ?? 0);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const load = (force = false) => {
      void cachedFetch<number>(cacheKey, async () => {
        const { data, error } = await (supabase as any).rpc('get_case_chat_unread_total');
        if (error) return 0;
        return Number(data) || 0;
      }, { force }).then(total => { if (!cancelled) setCount(total); }).catch(() => { /* noop */ });
    };

    load();
    const ch = supabase
      .channel(`sidebar-cases-unread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_messages' }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'case_chat_reads', filter: `user_id=eq.${user.id}` }, () => load(true))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id, cacheKey]);

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

type NavAccess = 'all' | 'crm' | 'erp' | 'admin' | 'lead' | 'master';
type ProcessNavItem = { href: string; label: string; icon: any; access?: NavAccess; badge?: 'cases' | 'container'; secondary?: boolean; children?: ProcessNavItem[] };
type ProcessNavGroup = { id: string; label: string; icon: any; items: ProcessNavItem[] };

const processNavGroups: ProcessNavGroup[] = [
  { id: 'overview', label: 'Übersicht', icon: LayoutDashboard, items: [
    { href: '/', label: 'Mein Dashboard', icon: LayoutDashboard },
    { href: '/cases', label: 'Meine Vorgänge', icon: ClipboardList, badge: 'cases' },
    { href: '/cases/kanban', label: 'Kanban', icon: Workflow },
    { href: '/crm/activities/calendar', label: 'Kalender', icon: Calendar, access: 'crm' },
    { href: '/cockpit', label: 'Cockpit (Beta)', icon: LayoutDashboard },
  ]},
  { id: 'sales', label: 'Kunden gewinnen', icon: Target, items: [
    { href: '/crm/dashboard', label: 'Vertriebsübersicht', icon: LayoutDashboard, access: 'crm', children: [
      { href: '/crm/dashboard', label: 'Übersicht', icon: LayoutDashboard },
      { href: '/crm/interessenten', label: 'Offene Interessenten', icon: Target },
      { href: '/crm/verkaufschancen', label: 'Aktuelle Verkaufschancen', icon: Briefcase },
      { href: '/crm/angebote', label: 'Angebotsstatus', icon: FileText },
      { href: '/crm/kommunikation', label: 'Aktivitätenübersicht', icon: Activity },
      { href: '/crm/forecast', label: 'Umsatz-Pipeline & Forecast', icon: TrendingUp },
      { href: '/crm/settings/ziele', label: 'Vertriebsziele', icon: Trophy },
    ] },
    { href: '/crm/outbound', label: 'Kundenakquise', icon: Send, access: 'crm', children: [
      { href: '/crm/outbound', label: 'Übersicht', icon: Send },
      { href: '/crm/outbound/research', label: 'Zielkunden recherchieren', icon: Search },
      { href: '/crm/outbound/people', label: 'Ansprechpartner identifizieren', icon: Users },
      { href: '/crm/outbound/email', label: 'Erstkontakt per E-Mail', icon: Mail },
      { href: '/crm/outbound/phone', label: 'Erstkontakt per Telefon', icon: Phone },
      { href: '/crm/outbound/social', label: 'LinkedIn / Xing', icon: Globe },
      { href: '/crm/outbound/fairs', label: 'Messekontakt nachverfolgen', icon: CalendarClock },
      { href: '/crm/outbound/visits', label: 'Besuchstermin vereinbaren', icon: Calendar },
      { href: '/crm/outbound/campaigns', label: 'Akquisekampagnen', icon: Megaphone },
    ] },
    { href: '/crm/interessenten', label: 'Neue Interessenten', icon: Target, access: 'crm', children: [
      { href: '/crm/interessenten', label: 'Übersicht', icon: Target },
      { href: '/crm/interessenten/qualifizieren', label: 'Qualifizieren & schützen', icon: ShieldCheck },
      { href: '/crm/interessenten/bewerten', label: 'Interessenten bewerten', icon: Star },
      { href: '/crm/interessenten/zuweisen', label: 'Zuständigkeit zuweisen', icon: UserPlus },
      { href: '/crm/interessenten/umwandeln', label: 'In Kunde umwandeln', icon: Building2 },
      { href: '/crm/interessenten/archiv', label: 'Archivierte Interessenten', icon: FolderArchive },
      { href: '/crm/interessenten/historie', label: 'Interessenten-Historie', icon: Activity },
      { href: '/crm/outbound/leads?action=new', label: 'Interessent anlegen', icon: Plus },
      { href: '/crm/outbound/leads?action=import', label: 'Interessenten importieren', icon: Upload },
    ] },
    { href: '/crm/firmen', label: 'Kundenfirmen & Partner', icon: Building2, access: 'crm', children: [
      { href: '/crm/firmen', label: 'Übersicht', icon: Building2 },
      { href: '/crm/firmen/bearbeiten', label: 'Firmendaten vervollständigen', icon: Pencil },
      { href: '/crm/firmen/standorte', label: 'Adressen & Standorte', icon: MapPin },
      { href: '/crm/firmen/gruppen', label: 'Kundengruppen', icon: Users },
      { href: '/crm/firmen/lieferanten', label: 'Lieferanten', icon: Truck },
      { href: '/crm/firmen/dokumente', label: 'Dokumente', icon: FileText },
      { href: '/crm/firmen/historie', label: 'Firmenhistorie', icon: Activity },
      { href: '/crm/companies?action=new', label: 'Firma / Partner anlegen', icon: Plus },
    ] },
    { href: '/crm/ansprechpartner', label: 'Ansprechpartner', icon: Users, access: 'crm', children: [
      { href: '/crm/ansprechpartner', label: 'Übersicht', icon: Users },
      { href: '/crm/ansprechpartner/pflegen', label: 'Kontaktdaten pflegen', icon: Pencil },
      { href: '/crm/ansprechpartner/zuweisen', label: 'Zuständigkeit zuweisen', icon: UserPlus },
      { href: '/crm/ansprechpartner/verantwortlichkeiten', label: 'Verantwortlichkeiten', icon: Briefcase },
      { href: '/crm/ansprechpartner/email', label: 'E-Mail-Adressen', icon: Mail },
      { href: '/crm/ansprechpartner/telefon', label: 'Telefonverzeichnis', icon: Phone },
      { href: '/crm/ansprechpartner/historie', label: 'Kontaktverlauf', icon: Activity },
      { href: '/crm/ansprechpartner/inaktiv', label: 'Inaktive Kontakte', icon: EyeOff },
      { href: '/crm/contacts?action=new', label: 'Kontakt anlegen', icon: Plus },
    ] },
    { href: '/crm/kommunikation', label: 'Kommunikation & Aufgaben', icon: Activity, access: 'crm', children: [
      { href: '/crm/kommunikation', label: 'Übersicht', icon: Activity },
      { href: '/crm/kommunikation/aufgaben', label: 'Offene Aufgaben', icon: ClipboardList },
      { href: '/crm/kommunikation/wiedervorlagen', label: 'Wiedervorlagen', icon: CalendarClock },
      { href: '/crm/kommunikation/termine', label: 'Termine', icon: Calendar },
      { href: '/crm/kommunikation/telefonate', label: 'Telefonate', icon: Phone },
      { href: '/crm/kommunikation/emails', label: 'E-Mails', icon: Mail },
      { href: '/crm/kommunikation/besuchsberichte', label: 'Besuchsberichte', icon: FileText },
      { href: '/crm/kommunikation/erledigt', label: 'Erledigt', icon: Check },
      { href: '/crm/activities?action=new&type=task', label: 'Aufgabe anlegen', icon: Plus },
      { href: '/crm/activities?action=new&type=call', label: 'Telefonat dokumentieren', icon: Phone },
      { href: '/crm/activities?action=new&type=email', label: 'E-Mail protokollieren', icon: Mail },
      { href: '/crm/activities?action=new&type=meeting', label: 'Termin planen', icon: Calendar },
      { href: '/crm/activities?action=new&type=meeting&visit=1', label: 'Besuchsbericht erfassen', icon: FileText },
      { href: '/crm/activities?action=new&type=followup', label: 'Wiedervorlage erstellen', icon: CalendarClock },
      { href: '/crm/activities?action=new&type=note', label: 'Notiz hinterlegen', icon: StickyNote },
    ] },
    { href: '/crm/verkaufschancen', label: 'Verkaufschancen', icon: Briefcase, access: 'crm', children: [
      { href: '/crm/verkaufschancen', label: 'Übersicht', icon: Briefcase },
      { href: '/crm/verkaufschancen/pipeline', label: 'Pipeline nach Phase', icon: Workflow },
      { href: '/crm/verkaufschancen/bewerten', label: 'Bewerten & Umsatzpotenzial', icon: TrendingUp },
      { href: '/crm/verkaufschancen/phasen', label: 'Phase weiterschieben', icon: Workflow },
      { href: '/crm/verkaufschancen/faellig', label: 'Fällige Abschlüsse', icon: CalendarClock },
      { href: '/crm/verkaufschancen/zuweisen', label: 'Zuständigkeit zuweisen', icon: UserPlus },
      { href: '/crm/verkaufschancen/abgeschlossen', label: 'Abgeschlossene Chancen', icon: Trophy },
      { href: '/crm/deals?action=new', label: 'Verkaufschance anlegen', icon: Plus },
      { href: '/crm/settings/automationen', label: 'Wahrscheinlichkeiten', icon: Settings },
      { href: '/crm/verkaufschancen/mitbewerber', label: 'Mitbewerber erfassen', icon: Users },
      { href: '/crm/verkaufschancen/projekte', label: 'Projektinformationen', icon: FolderKanban },
    ] },
    { href: '/crm/angebote', label: 'Angebote', icon: FileText, access: 'crm', children: [
      { href: '/crm/angebote', label: 'Übersicht', icon: FileText },
      { href: '/crm/angebote/kalkulation', label: 'Angebotsentwürfe', icon: Receipt },
      { href: '/crm/angebote/versand', label: 'Versand & Nachverfolgung', icon: Send },
      { href: '/crm/angebote/versionen', label: 'Angebotsversionen', icon: FileText },
      { href: '/crm/angebote/freigegeben', label: 'Angenommene Angebote', icon: ShieldCheck },
      { href: '/crm/angebote/auftraege', label: 'Aufträge erzeugen', icon: ClipboardList },
      { href: '/crm/angebote/prozessform', label: 'Punkt / Linie / Dreieck / Quadrat', icon: Workflow },
      { href: '/crm/offers?action=new', label: 'Angebot erstellen', icon: Plus },
    ] },
  ]},
  { id: 'fulfillment', label: 'Aufträge abwickeln', icon: ClipboardList, items: [
    { href: '/orders', label: 'Aufträge', icon: ClipboardList, access: 'erp' },
    { href: '/admin/disposition', label: 'Disposition', icon: Activity, access: 'erp' },
    { href: '/kapazitaet', label: 'Kapazitätsplan', icon: CalendarRange, access: 'erp' },
    { href: '/admin/production', label: 'Werkstattaufträge', icon: Wrench, access: 'erp' },
    { href: '/fremdbearbeitung', label: 'Fremdbearbeitung', icon: Wrench, access: 'erp' },
    { href: '/lieferscheine', label: 'Lieferscheine', icon: Truck, access: 'erp' },
    { href: '/admin/templates', label: 'Standard Vorgänge', icon: FileText, access: 'admin' },
  ]},
  { id: 'procurement', label: 'Einkaufen & lagern', icon: ShoppingCart, items: [
    { href: '/admin/purchasing', label: 'Einkauf', icon: ShoppingCart, access: 'erp' },
    { href: '/bestellungen', label: 'Bestellungen', icon: ShoppingCart, access: 'erp' },
    { href: '/admin/inventory', label: 'Lager', icon: Package, access: 'erp' },
    { href: '/eingangsrechnungen', label: 'Eingangsrechnungen', icon: Receipt, access: 'erp' },
    { href: '/lieferantenbewertung', label: 'Lieferantenbewertung', icon: Star, access: 'erp' },
    { href: '/preismanagement', label: 'Preismanagement', icon: TrendingUp, access: 'erp' },
    { href: '/ki-artikel', label: 'KI-Artikelanlage', icon: Sparkles, access: 'erp' },
    { href: '/admin/articles', label: 'Artikel (ISSOS)', icon: Package, access: 'erp' },
  ]},
  { id: 'finance', label: 'Abrechnen & auswerten', icon: Receipt, items: [
    { href: '/rechnungen', label: 'Rechnungen', icon: Receipt, access: 'erp' },
    { href: '/admin/erp-export', label: 'Mahnwesen & DATEV', icon: Receipt, access: 'erp' },
    { href: '/crm/analytics', label: 'CRM-Auswertungen', icon: TrendingUp, access: 'crm' },
    { href: '/reporting/einkauf', label: 'Einkaufsreporting', icon: TrendingUp, access: 'erp' },
  ]},
  { id: 'knowledge', label: 'Wissen & Zusammenarbeit', icon: BookOpen, items: [
    { href: '/projects', label: 'Projekte', icon: FolderKanban },
    { href: '/notes', label: 'Notizen', icon: StickyNote },
    { href: '/crm/wiki', label: 'Wiki', icon: BookOpen, access: 'crm' },
    { href: '/zeichnungen', label: 'Zeichnungen', icon: FileText, access: 'erp' },
    { href: '/container', label: '3D Container', icon: FolderArchive, badge: 'container' },
    { href: '/support', label: 'Support', icon: Headphones },
    { href: '/docs', label: 'Dokumentation', icon: BookOpen },
    { href: '/map', label: 'Business Map', icon: Network, access: 'admin' },
  ]},
  { id: 'admin', label: 'Verwaltung', icon: Settings, items: [
    { href: '/admin/dashboard', label: 'Verwaltungsübersicht', icon: LayoutDashboard, access: 'lead' },
    { href: '/admin/users', label: 'Mitarbeiter', icon: Users, access: 'admin' },
    { href: '/admin/departments', label: 'Abteilungen', icon: Building2, access: 'lead' },
    { href: '/admin/master-data', label: 'Stammdaten', icon: Database, access: 'admin' },
    { href: '/admin/pdf-vorlagen', label: 'PDF-Vorlagen', icon: FileText, access: 'admin' },
    { href: '/crm/settings', label: 'CRM-Einstellungen', icon: Settings, access: 'crm' },
    { href: '/crm/settings/routing', label: 'Auto-Routing', icon: Workflow, access: 'crm', secondary: true },
    { href: '/crm/settings/webformulare', label: 'Webformulare', icon: Globe, access: 'crm', secondary: true },
    { href: '/admin/workflows', label: 'Workflows', icon: Workflow, access: 'admin', secondary: true },
    { href: '/admin/document-types', label: 'Dokumenttypen', icon: FileText, access: 'admin', secondary: true },
    { href: '/admin/action-rules', label: 'Aktions-Regeln', icon: Workflow, access: 'admin', secondary: true },
    { href: '/admin/security', label: 'Sicherheit', icon: ShieldCheck, access: 'admin', secondary: true },
    { href: '/admin/backups', label: 'Backups', icon: DatabaseBackup, access: 'admin', secondary: true },
    { href: '/admin/api-explorer', label: 'API-Explorer', icon: TerminalSquare, access: 'admin', secondary: true },
    { href: '/admin/announcements', label: 'Mitteilungen', icon: Megaphone, access: 'admin', secondary: true },
    { href: '/admin/feedback', label: 'Feedback', icon: Star, access: 'admin', secondary: true },
    { href: '/products/requests', label: 'Produktvorschläge', icon: Package, access: 'admin', secondary: true },
    { href: '/admin/ai-prompts', label: 'KI-Prompts', icon: Sparkles, access: 'admin', secondary: true },
    { href: '/admin/inbox-stats', label: 'Inbox-Statistik', icon: LayoutDashboard, access: 'admin', secondary: true },
    { href: '/admin/duplicate-scan', label: 'MTIQ Duplikat-Scan', icon: Sparkles, access: 'admin', secondary: true },
    { href: '/admin/container-access', label: 'Container-Zugriff', icon: Lock, access: 'admin', secondary: true },
    { href: '/admin/folder-templates', label: 'Ordner-Vorlagen', icon: FolderTree, access: 'admin', secondary: true },
    { href: '/admin/deleted-cases', label: 'Gelöschte Vorgänge', icon: Trash2, access: 'admin', secondary: true },
    { href: '/admin/papierkorb', label: 'Papierkorb', icon: Trash2, access: 'master', secondary: true },
  ]},
];

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role, signOut, isAdmin, user } = useAuth();
  const isMaster = isMasterUser(user?.id);
  const { isLead } = useLedDepartments();
  const { allowed: erpAllowed } = useErpAccess();
  const { allowed: crmAllowed } = useCrmAccess();
  const showErp = isAdmin || erpAllowed;
  const showCrm = isAdmin || crmAllowed === true;
  const { preferences, setTheme, setCompactTables, setSidebarCompact } = usePreferences();
  const sidebarCompact = preferences.sidebarCompact;
  const sbText = sidebarCompact ? 'text-sm' : 'text-[15px]';
  const sbPy = sidebarCompact ? 'py-2' : 'py-2.5';
  const sbWidth = sidebarCompact ? 'w-56' : 'w-64';
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  usePresenceHeartbeat();

  const canAccessNavItem = (access: NavAccess = 'all') => {
    if (access === 'crm') return showCrm;
    if (access === 'erp') return showErp;
    if (access === 'admin') return isAdmin;
    if (access === 'lead') return isAdmin || isLead;
    if (access === 'master') return isAdmin && isMaster;
    return true;
  };

  const visibleGroups = useMemo(
    () => processNavGroups
      .map(group => ({ ...group, items: group.items
        .filter(item => canAccessNavItem(item.access))
        .map(item => item.children
          ? { ...item, children: item.children.filter(child => canAccessNavItem(child.access)) }
          : item)
        .filter(item => !item.children || item.children.length > 0) }))
      .filter(group => group.items.length > 0),
    [showCrm, showErp, isAdmin, isLead, isMaster],
  );

  const pathMatches = (href: string) => href === '/'
    ? location.pathname === '/'
    : location.pathname === href || location.pathname.startsWith(`${href}/`);

  const activeHref = visibleGroups
    .flatMap(group => group.items)
    .flatMap(item => item.children ? [item, ...item.children] : [item])
    .filter(item => pathMatches(item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const routeGroup = visibleGroups.find(group => group.items
    .flatMap(item => item.children ? [item, ...item.children] : [item])
    .some(item => item.href === activeHref))?.id ?? 'overview';

  const { navRef, onScroll, openGroup, setOpenGroup, openNavItem, setOpenNavItem, moreAdminOpen, setMoreAdminOpen } = useSidebarNavigation(
    user?.id,
    routeGroup,
    visibleGroups.find(group => group.id === routeGroup)?.items.some(item => item.href === activeHref && item.secondary) ?? false,
  );

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

  const active = (href: string) => href === activeHref;

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

        <nav ref={navRef} onScroll={onScroll} aria-label="Seitennavigation" className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {/* Search trigger */}
          <button
            onClick={() => { setOpen(false); setCmdOpen(true); }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors mb-1"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Suche</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-sidebar-border px-1 py-0.5 text-[9px] font-mono text-muted-foreground">⌘K</kbd>
          </button>
          
          {visibleGroups.map(group => {
            const expanded = openGroup === group.id;
            const primaryItems = group.items.filter(item => !item.secondary);
            const secondaryItems = group.items.filter(item => item.secondary);
            return (
              <div key={group.id} className="py-0.5">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenGroup(expanded ? null : group.id)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded text-[13px] w-full transition-colors',
                    expanded ? 'text-foreground bg-sidebar-accent/35 font-medium' : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/40',
                  )}
                >
                  <group.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">{group.label}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="mt-0.5 mb-1">
                    {primaryItems.map(item => (
                      <div key={item.href}>
                        <div className="flex items-center">
                          <Link to={item.href} onClick={() => setOpen(false)} className={cn(linkClass(item.href), 'pl-9 !text-xs !py-1.5 flex-1')}>
                            <item.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.badge === 'cases' && <CasesUnreadBadge />}
                            {item.badge === 'container' && <ContainerUnreadBadge />}
                          </Link>
                          {item.children && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={`${item.label} Unterpunkte`} onClick={() => setOpenNavItem(openNavItem === item.href ? null : item.href)}>
                              <ChevronRight className={cn('h-3 w-3 transition-transform', openNavItem === item.href && 'rotate-90')} />
                            </Button>
                          )}
                        </div>
                        {item.children && openNavItem === item.href && (
                          <div className="mb-1 border-l border-sidebar-border ml-10">
                            {item.children.map(child => (
                              <Link key={`${child.href}-${child.label}`} to={child.href} onClick={() => setOpen(false)} className="flex items-center gap-2 pl-3 pr-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 rounded-r">
                                <child.icon className="h-3 w-3 shrink-0" />
                                <span className="flex-1 leading-tight">{child.label}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {secondaryItems.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setMoreAdminOpen(value => !value)}
                          className="flex items-center gap-2.5 w-full pl-9 pr-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 transition-colors"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">Weitere Einstellungen</span>
                          <ChevronDown className={cn('h-3 w-3 transition-transform', moreAdminOpen && 'rotate-180')} />
                        </button>
                        {moreAdminOpen && secondaryItems.map(item => (
                          <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={cn(linkClass(item.href), 'pl-14 !text-[11px] !py-1')}>
                            <item.icon className="h-3 w-3 shrink-0" />
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="mt-1">
            <button
              onClick={() => setBugDialogOpen(true)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/40 transition-colors"
            >
              <Bug className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Bug / Feedback melden</span>
            </button>
            <Link to="/feedback" onClick={() => setOpen(false)} className={cn(linkClass('/feedback'), 'pl-9 !text-[11px] !py-1')}>
              <span>Meine Meldungen</span>
            </Link>
          </div>
        </nav>

        <div className="px-4 pb-3 pt-3 mt-1 shrink-0 flex items-center justify-between gap-2">
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

        <div className="px-3 py-3 shrink-0">
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
        <main className="erp-shell flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8 relative z-[1]"><MfaReminderBanner /><SatisfactionSurveyBanner />{isAdmin ? <PerfProfiler id="route">{children}</PerfProfiler> : children}</main>
        
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
      <MtiqWriter />
      <BugReportDialog open={bugDialogOpen} onOpenChange={setBugDialogOpen} />
      {isAdmin && <PerfPanel />}
      <PdfJobToaster />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { CommandPalette } from '@/components/CommandPalette';
import { NotificationBell } from '@/components/NotificationBell';
import {
  LayoutDashboard, ClipboardList, Settings, Users, Database,
  LogOut, Menu, X, ChevronDown, Sun, Moon, Building2, AlignJustify, AlignLeft,
  FolderKanban, BookOpen, Search,
} from 'lucide-react';
import mtconLogo from '@/assets/mtcon_logo.png';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Vorgänge', icon: ClipboardList },
  { href: '/cases/kanban', label: 'Kanban', icon: ClipboardList },
  { href: '/projects', label: 'Projekte', icon: FolderKanban },
  { href: '/docs', label: 'Dokumentation', icon: BookOpen },
];
const adminItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Mitarbeiter', icon: Users },
  { href: '/admin/departments', label: 'Abteilungen', icon: Building2 },
  { href: '/admin/master-data', label: 'Stammdaten', icon: Database },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role, signOut, isAdmin } = useAuth();
  const { preferences, setTheme, setCompactTables } = usePreferences();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));
  const [cmdOpen, setCmdOpen] = useState(false);

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

  const active = (href: string) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  const linkClass = (href: string) => cn(
    'flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors',
    active(href)
      ? 'bg-sidebar-accent text-foreground font-medium'
      : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60',
  );

  const isDark = preferences.theme === 'dark';
  const isCompact = preferences.compactTables;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {open && <div className="fixed inset-0 bg-foreground/10 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-56 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="h-7 w-7 flex items-center justify-center shrink-0">
            <img src={mtconLogo} alt="MTCON Logo" className="h-7 w-7 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Command Light</p>
            <p className="text-[9px] text-muted-foreground tracking-widest uppercase">v1.5</p>
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
              <item.icon className="h-4 w-4" />{item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex items-center gap-2.5 px-3 py-2 rounded text-sm text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60 w-full transition-colors"
              >
                <Settings className="h-4 w-4" />Verwaltung
                <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform', adminOpen && 'rotate-180')} />
              </button>
              {adminOpen && adminItems.map(item => (
                <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={cn(linkClass(item.href), 'pl-9')}>
                  <item.icon className="h-4 w-4" />{item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full rounded px-1 py-1 hover:bg-sidebar-accent/60 transition-colors">
                <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {profile?.short_code?.substring(0, 2).toUpperCase() || '??'}
                  </span>
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">{profile?.display_name || '–'}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{role || '–'}</p>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
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
              <DropdownMenuItem onClick={signOut} className="gap-2 text-xs text-destructive cursor-pointer">
                <LogOut className="h-3.5 w-3.5" />Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          <button onClick={() => setOpen(true)}><Menu className="h-5 w-5 text-foreground" /></button>
          <span className="text-sm font-semibold text-foreground flex-1">KS Command Light</span>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button onClick={() => setCmdOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted/60">
              <Search className="h-5 w-5" />
            </button>
          </div>
        </header>
        {/* Desktop header bar with notifications */}
        <header className="hidden lg:flex items-center justify-end gap-2 px-6 h-12 border-b border-border bg-card/50 shrink-0">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

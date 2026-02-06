import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, ClipboardList, Settings, Users, Database,
  LogOut, Menu, X, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/cases', label: 'Vorgänge', icon: ClipboardList },
];
const adminItems = [
  { href: '/admin/users', label: 'Mitarbeiter', icon: Users },
  { href: '/admin/master-data', label: 'Stammdaten', icon: Database },
];

export function AppLayout({ children }: AppLayoutProps) {
  const { profile, role, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(location.pathname.startsWith('/admin'));

  const active = (href: string) => href === '/' ? location.pathname === '/' : location.pathname.startsWith(href);

  const linkClass = (href: string) => cn(
    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
    active(href) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {open && <div className="fixed inset-0 bg-background/60 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-60 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border shrink-0">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">KS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sidebar-foreground leading-tight">Command Light</p>
            <p className="text-[10px] text-muted-foreground">Vorgänge</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={linkClass(item.href)}>
              <item.icon className="h-4 w-4" />{item.label}
            </Link>
          ))}
          {isAdmin && (
            <>
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 w-full"
              >
                <Settings className="h-4 w-4" />Admin
                <ChevronDown className={cn('h-3 w-3 ml-auto transition-transform', adminOpen && 'rotate-180')} />
              </button>
              {adminOpen && adminItems.map(item => (
                <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={cn(linkClass(item.href), 'pl-10')}>
                  <item.icon className="h-4 w-4" />{item.label}
                </Link>
              ))}
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-medium text-primary">
                {profile?.short_code?.substring(0, 2).toUpperCase() || '??'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.display_name || '…'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{role || '…'}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-card shrink-0">
          <button onClick={() => setOpen(true)}><Menu className="h-5 w-5 text-foreground" /></button>
          <span className="text-sm font-semibold text-foreground">KS Command Light</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

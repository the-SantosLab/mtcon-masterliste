import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Briefcase, Building2, Users, FileText,
  Activity, Settings, LogOut, Menu, X, ChevronDown, ArrowLeftRight,
} from 'lucide-react';
import mtconLogo from '@/assets/mtcon_logo.png';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/UserAvatar';

const navItems = [
  { href: '/crm/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/crm/deals', label: 'Deals', icon: Briefcase },
  { href: '/crm/companies', label: 'Unternehmen', icon: Building2 },
  { href: '/crm/contacts', label: 'Kontakte', icon: Users },
  { href: '/crm/offers', label: 'Angebote', icon: FileText },
  { href: '/crm/activities', label: 'Aktivitäten', icon: Activity },
  { href: '/crm/settings', label: 'Einstellungen', icon: Settings },
];

export function CrmLayout({ children }: { children: React.ReactNode }) {
  const { profile, role, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const active = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + '/');

  const linkClass = (href: string) => cn(
    'relative flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-all duration-150',
    active(href)
      ? 'bg-primary/15 text-foreground font-semibold border-l-[3px] border-primary pl-[calc(0.75rem-3px)]'
      : 'text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60',
  );

  const switchModule = () => {
    localStorage.setItem('mtcon.module', 'ops');
    navigate('/');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background glass-bg">
      {open && <div className="fixed inset-0 bg-foreground/10 z-40 lg:hidden" onClick={() => setOpen(false)} />}

      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-56 flex flex-col glass-sidebar transition-transform duration-200',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="flex items-center gap-2 px-3 h-14 border-b border-sidebar-border shrink-0">
          <div className="h-10 w-10 flex items-center justify-center shrink-0">
            <img src={mtconLogo} alt="MTCON" className="h-10 w-10 object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-medium text-muted-foreground leading-tight">CRM</p>
            <p className="text-[8px] text-muted-foreground/60 tracking-widest uppercase">Vertrieb</p>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className={linkClass(item.href)}>
              <item.icon className="h-4 w-4" />{item.label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-2 border-t border-sidebar-border">
          <button
            onClick={switchModule}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 transition-colors"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Zur Masterliste
          </button>
        </div>

        <div className="border-t border-sidebar-border px-3 py-3 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 w-full rounded px-1 py-1 hover:bg-sidebar-accent/60 transition-colors">
                <UserAvatar
                  user={profile ? { id: profile.id, display_name: profile.display_name, short_code: profile.short_code, avatar_url: (profile as any).avatar_url } : null}
                  size="md" tooltip={false}
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">{profile?.display_name || '–'}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{role || '–'}</p>
                </div>
                <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 mb-1 text-xs">
              <DropdownMenuItem onClick={() => navigate('/modules')} className="gap-2 text-xs cursor-pointer">
                <ArrowLeftRight className="h-3.5 w-3.5" />Modul wechseln
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
          <span className="text-sm font-semibold text-foreground flex-1">CRM</span>
        </header>
        <main className="flex-1 overflow-y-auto p-5 lg:p-8 relative z-[1]">{children}</main>
      </div>
    </div>
  );
}

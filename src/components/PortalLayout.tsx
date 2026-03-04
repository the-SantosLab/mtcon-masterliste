import { Link, useLocation } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { cn } from '@/lib/utils';
import { Ticket, Plus, LogOut, LayoutDashboard } from 'lucide-react';
import mtconLogo from '@/assets/mtcon_logo.png';

const portalNav = [
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/tickets', label: 'Meine Tickets', icon: Ticket },
  { href: '/portal/tickets/new', label: 'Neues Ticket', icon: Plus },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { customer, signOut } = usePortalAuth();
  const location = useLocation();

  const active = (href: string) => location.pathname === href;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={mtconLogo} alt="Logo" className="h-8 w-8 object-contain" />
            <span className="text-sm font-semibold text-foreground">Support Portal</span>
          </div>
          <nav className="hidden sm:flex items-center gap-1">
            {portalNav.map(item => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  active(item.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {customer?.display_name}
              {customer?.company_name && <span className="ml-1 text-muted-foreground/60">({customer.company_name})</span>}
            </span>
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Abmelden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {/* Mobile nav */}
        <div className="sm:hidden border-t border-border flex">
          {portalNav.map(item => (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors',
                active(item.href)
                  ? 'text-primary font-medium border-b-2 border-primary'
                  : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

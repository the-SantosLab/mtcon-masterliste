import { Link, useLocation } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { cn } from '@/lib/utils';
import { Ticket, Plus, LogOut, LayoutDashboard, Menu, X } from 'lucide-react';
import { useState } from 'react';
import mtconLogo from '@/assets/mtcon_logo.png';
import '@/styles/portal.css';

const portalNav = [
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/portal/tickets', label: 'Meine Tickets', icon: Ticket },
  { href: '/portal/tickets/new', label: 'Neues Ticket', icon: Plus },
];

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { customer, signOut } = usePortalAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = (href: string) => location.pathname === href;

  return (
    <div className="portal-shell">
      {/* Nav */}
      <header className="portal-nav sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={mtconLogo} alt="MTCON" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block">
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'hsl(var(--portal-text))' }}>
                MTCON
              </span>
              <span className="text-[10px] ml-1.5 font-medium" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                Support Portal
              </span>
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-1">
            {portalNav.map(item => (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all duration-200',
                  active(item.href)
                    ? 'text-white'
                    : 'hover:bg-white/5',
                )}
                style={{
                  color: active(item.href) ? 'hsl(var(--portal-text))' : 'hsl(var(--portal-text-secondary))',
                  background: active(item.href) ? 'hsl(var(--portal-accent) / 0.12)' : undefined,
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-medium" style={{ color: 'hsl(var(--portal-text))' }}>
                {customer?.display_name}
              </span>
              {customer?.company_name && (
                <span className="text-[10px]" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                  {customer.company_name}
                </span>
              )}
            </div>
            <button
              onClick={signOut}
              className="p-2 rounded-xl transition-colors hover:bg-white/5"
              style={{ color: 'hsl(var(--portal-text-secondary))' }}
              title="Abmelden"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              className="sm:hidden p-2 rounded-xl hover:bg-white/5"
              style={{ color: 'hsl(var(--portal-text-secondary))' }}
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {mobileOpen && (
          <div className="sm:hidden border-t px-4 py-3 space-y-1" style={{ borderColor: 'hsl(var(--portal-glass-border) / 0.3)' }}>
            {portalNav.map(item => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                )}
                style={{
                  color: active(item.href) ? 'hsl(var(--portal-text))' : 'hsl(var(--portal-text-secondary))',
                  background: active(item.href) ? 'hsl(var(--portal-accent) / 0.12)' : undefined,
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t mt-2" style={{ borderColor: 'hsl(var(--portal-glass-border) / 0.2)' }}>
              <span className="text-xs px-3" style={{ color: 'hsl(var(--portal-text-secondary))' }}>
                {customer?.display_name}
                {customer?.company_name && ` · ${customer.company_name}`}
              </span>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}

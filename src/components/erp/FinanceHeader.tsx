import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Receipt, AlarmClock, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import './fulfillment.css';

const navigation = [
  { to: '/rechnungen', label: 'Rechnungen', icon: Receipt },
  { to: '/admin/erp-export', label: 'Mahnwesen & DATEV', icon: AlarmClock },
  { to: '/bankabgleich', label: 'Bankabgleich', icon: Receipt },
  { to: '/kennzahlen', label: 'Kennzahlen', icon: BarChart3 },
  { to: '/crm/analytics', label: 'CRM-Auswertungen', icon: TrendingUp },
  { to: '/reporting/einkauf', label: 'Einkaufsreporting', icon: BarChart3 },
];

export function FinanceHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <header className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Abrechnen & auswerten</p>
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <nav aria-label="Abrechnen und auswerten" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
      {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className="shrink-0">
        {({ isActive }) => <Button asChild size="sm" variant="ghost" className={cn('h-8 text-xs', isActive ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground')}>
          <span><Icon className="h-3.5 w-3.5" />{label}</span>
        </Button>}
      </NavLink>)}
    </nav>
  </header>;
}

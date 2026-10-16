import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ClipboardList, Activity, CalendarRange, Wrench, Truck, FileText, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import './fulfillment.css';

const navigation = [
  { to: '/orders', label: 'Aufträge', icon: ClipboardList },
  { to: '/admin/disposition', label: 'Disposition', icon: Activity },
  { to: '/kapazitaet', label: 'Kapazitätsplan', icon: CalendarRange },
  { to: '/admin/production', label: 'Werkstatt', icon: Wrench },
  { to: '/fremdbearbeitung', label: 'Fremdbearbeitung', icon: ArrowUpRight },
  { to: '/lieferscheine', label: 'Lieferscheine', icon: Truck },
  { to: '/admin/templates', label: 'Standard Vorgänge', icon: FileText, admin: true },
];

export function FulfillmentHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  const { isAdmin } = useAuth();
  return <header className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Aufträge abwickeln</p>
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <nav aria-label="Auftragsabwicklung" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
      {navigation.filter(item => !item.admin || isAdmin).map(({ to, label, icon: Icon }) =>
        <NavLink key={to} to={to} end className="shrink-0">
          {({ isActive }) => <Button asChild size="sm" variant="ghost" className={cn('h-8 text-xs', isActive ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground')}>
            <span><Icon className="h-3.5 w-3.5" />{label}</span>
          </Button>}
        </NavLink>)}
    </nav>
  </header>;
}

export type FulfillmentMetric = { label: string; value: string | number; detail?: string; tone?: 'working' | 'done' | 'overdue'; onClick?: () => void; active?: boolean };
export function FulfillmentMetrics({ metrics, loading = false }: { metrics: FulfillmentMetric[]; loading?: boolean }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-border pb-5 lg:grid-cols-4">
    {metrics.map(metric => {
      const content = <><span className="block text-xs font-normal text-muted-foreground">{metric.label}</span>
        <span className={cn('mt-2 block break-words text-2xl font-medium tabular-nums', metric.tone === 'overdue' ? 'text-status-overdue' : metric.tone === 'done' ? 'text-status-done' : metric.tone === 'working' ? 'text-status-working' : 'text-foreground')}>{loading ? '—' : metric.value}</span>
        {metric.detail && <span className="mt-1 block text-[11px] font-normal text-muted-foreground">{metric.detail}</span>}</>;
      return metric.onClick ? <Button key={metric.label} variant="ghost" onClick={metric.onClick} aria-pressed={metric.active} className={cn('h-auto min-w-0 justify-start whitespace-normal rounded-sm px-2 py-2 text-left block', metric.active && 'bg-primary/10 ring-1 ring-primary/20')}>{content}</Button> : <div key={metric.label} className="min-w-0 py-2">{content}</div>;
    })}
  </div>;
}
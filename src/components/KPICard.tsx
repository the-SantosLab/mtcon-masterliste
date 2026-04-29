import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  iconClassName?: string;
  onClick?: () => void;
  active?: boolean;
}

export function KPICard({ title, value, icon: Icon, iconClassName, onClick, active }: KPICardProps) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        'glass-card glass-kpi px-5 py-4 text-left w-full transition-all',
        interactive && 'hover:border-primary/40 hover:-translate-y-0.5 cursor-pointer',
        active && 'border-primary ring-1 ring-primary/40',
        !interactive && 'cursor-default',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <Icon className={`h-4 w-4 text-muted-foreground ${iconClassName || ''}`} />
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </button>
  );
}

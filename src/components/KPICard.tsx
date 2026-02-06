import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  iconClassName?: string;
}

export function KPICard({ title, value, icon: Icon, iconClassName }: KPICardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4">
      <div className={cn('rounded-lg p-2.5 bg-secondary', iconClassName)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{title}</p>
      </div>
    </div>
  );
}

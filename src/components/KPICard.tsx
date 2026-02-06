import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  iconClassName?: string;
}

export function KPICard({ title, value, icon: Icon, iconClassName }: KPICardProps) {
  return (
    <div className="bg-card rounded-md border border-border px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
        <Icon className={`h-4 w-4 text-muted-foreground ${iconClassName || ''}`} />
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

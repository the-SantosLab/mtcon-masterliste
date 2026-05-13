import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/crm/settings', label: 'Preislisten' },
  { href: '/crm/settings/roles', label: 'Rollen' },
  { href: '/crm/settings/zugang', label: 'Zugang' },
];

export function CrmSettingsTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex gap-1 mb-5 border-b border-border">
      {TABS.map(t => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            to={t.href}
            className={cn(
              'px-3 py-2 text-xs font-medium transition-colors -mb-px border-b-2',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

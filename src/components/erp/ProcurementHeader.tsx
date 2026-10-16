import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingCart, ClipboardList, Package, Receipt, Star, TrendingUp, Sparkles, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import './fulfillment.css';
import './procurement.css';

const navigation = [
  { to: '/admin/purchasing', label: 'Einkauf', icon: ShoppingCart },
  { to: '/bestellungen', label: 'Bestellungen', icon: ClipboardList },
  { to: '/admin/inventory', label: 'Lager', icon: Package },
  { to: '/eingangsrechnungen', label: 'Eingangsrechnungen', icon: Receipt },
  { to: '/lieferantenbewertung', label: 'Lieferantenbewertung', icon: Star },
  { to: '/preismanagement', label: 'Preismanagement', icon: TrendingUp },
  { to: '/ki-artikel', label: 'KI-Artikelanlage', icon: Sparkles },
  { to: '/admin/articles', label: 'Artikel (ISSOS)', icon: Boxes },
];

export function ProcurementHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <header className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-2 text-[11px] font-medium text-muted-foreground">Einkaufen & lagern</p>
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    <nav aria-label="Einkauf und Lager" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
      {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className="shrink-0">
        {({ isActive }) => <Button asChild size="sm" variant="ghost" className={cn('h-8 text-xs', isActive ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground')}>
          <span><Icon className="h-3.5 w-3.5" />{label}</span>
        </Button>}
      </NavLink>)}
    </nav>
  </header>;
}
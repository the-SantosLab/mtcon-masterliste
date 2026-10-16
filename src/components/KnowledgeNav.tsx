import { NavLink } from 'react-router-dom';
import { FolderKanban, StickyNote, BookOpen, FileText, FolderArchive, Headphones, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navigation = [
  { to: '/projects', label: 'Projekte', icon: FolderKanban },
  { to: '/notes', label: 'Notizen', icon: StickyNote },
  { to: '/crm/wiki', label: 'Wiki', icon: BookOpen },
  { to: '/zeichnungen', label: 'Zeichnungen', icon: FileText },
  { to: '/container', label: '3D Container', icon: FolderArchive },
  { to: '/support', label: 'Support', icon: Headphones },
  { to: '/docs', label: 'Dokumentation', icon: BookOpen },
  { to: '/map', label: 'Business Map', icon: Network, admin: true },
];

/** Presentation-only group navigation for "Wissen & Zusammenarbeit"; page access stays enforced by routes. */
export function KnowledgeNav({ className }: { className?: string }) {
  const { isAdmin } = useAuth();
  return <div className={cn('space-y-2', className)}>
    <p className="text-[11px] font-medium text-muted-foreground">Wissen & Zusammenarbeit</p>
    <nav aria-label="Wissen und Zusammenarbeit" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
      {navigation.filter(n => !n.admin || isAdmin).map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end className="shrink-0">
        {({ isActive }) => <Button asChild size="sm" variant="ghost" className={cn('h-8 text-xs', isActive ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground')}>
          <span><Icon className="h-3.5 w-3.5" />{label}</span>
        </Button>}
      </NavLink>)}
    </nav>
  </div>;
}

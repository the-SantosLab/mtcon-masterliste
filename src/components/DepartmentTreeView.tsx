import { useState } from 'react';
import { ChevronRight, Plus, User, ClipboardList } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DepartmentNode } from '@/lib/case-utils';

interface Props {
  nodes: DepartmentNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onCreateCase?: (departmentId: string) => void;
  showCounts?: boolean;
  compact?: boolean;
  defaultCollapsed?: boolean;
}

function TreeNode({
  node, depth, selectedId, onSelect, onCreateCase, showCounts, compact, defaultCollapsed,
}: { node: DepartmentNode; depth: number } & Omit<Props, 'nodes'>) {
  const [open, setOpen] = useState(defaultCollapsed ? false : depth === 0);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-md cursor-pointer transition-colors',
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60 text-foreground',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect?.(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setOpen(!open); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
          >
            <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-4.5" />
        )}

        <span className={cn('flex-1 truncate', compact ? 'text-xs' : 'text-sm', !node.parent_id && 'font-medium')}>
          {node.code && <span className="text-muted-foreground mr-1.5 font-mono text-[10px]">{node.code}</span>}
          {node.name}
        </span>

        {showCounts && node.case_count !== undefined && node.case_count > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            <ClipboardList className="h-2.5 w-2.5" />
            {node.case_count}
          </span>
        )}

        {node.head_name && (
          <span className="hidden lg:flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="h-2.5 w-2.5" />
            {node.head_name}
          </span>
        )}

        {onCreateCase && (
          <button
            onClick={e => { e.stopPropagation(); onCreateCase(node.id); }}
            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
            title="Vorgang erstellen"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {hasChildren && open && (
        <div>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateCase={onCreateCase}
              showCounts={showCounts}
              compact={compact}
              defaultCollapsed={defaultCollapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DepartmentTreeView({ nodes, selectedId, onSelect, onCreateCase, showCounts, compact, defaultCollapsed }: Props) {
  if (nodes.length === 0) {
    return <p className="text-xs text-muted-foreground p-4">Keine Abteilungen vorhanden</p>;
  }
  return (
    <div className="space-y-0.5">
      {nodes.map(node => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreateCase={onCreateCase}
          showCounts={showCounts}
          compact={compact}
          defaultCollapsed={defaultCollapsed}
        />
      ))}
    </div>
  );
}

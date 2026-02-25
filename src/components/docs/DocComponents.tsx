import { cn } from '@/lib/utils';

export function Badge({ children, color = 'muted' }: { children: React.ReactNode; color?: 'primary' | 'muted' | 'success' | 'warn' | 'danger' }) {
  const cls = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    muted: 'bg-muted text-muted-foreground border-border',
    success: 'bg-[hsl(var(--status-done)/0.15)] text-[hsl(var(--status-done))] border-[hsl(var(--status-done)/0.3)]',
    warn: 'bg-[hsl(var(--status-overdue)/0.15)] text-[hsl(var(--status-overdue))] border-[hsl(var(--status-overdue)/0.3)]',
    danger: 'bg-[hsl(var(--status-rejected)/0.15)] text-[hsl(var(--status-rejected))] border-[hsl(var(--status-rejected)/0.3)]',
  }[color];
  return <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border', cls)}>{children}</span>;
}

export function Rule({ label, value, color }: { label: string; value: string; color?: 'success' | 'danger' | 'warn' }) {
  const icon = color === 'success' ? '✓' : color === 'danger' ? '✗' : '○';
  const cls = color === 'success' ? 'text-[hsl(var(--status-done))]' : color === 'danger' ? 'text-[hsl(var(--status-rejected))]' : 'text-muted-foreground';
  return (
    <div className="flex items-start gap-2 py-1">
      <span className={cn('text-xs font-mono shrink-0', cls)}>{icon}</span>
      <div>
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground ml-2">{value}</span>
      </div>
    </div>
  );
}

export function Card({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <div id={id} className="rounded-md border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="px-5 py-4 space-y-3 text-xs text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

export function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded border border-border overflow-hidden mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {headers.map(h => <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/30">
              {row.map((cell, j) => <td key={j} className="px-3 py-2 text-foreground font-mono">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-muted rounded px-3 py-2.5 text-[11px] font-mono text-foreground overflow-x-auto border border-border mt-2">
      {children}
    </pre>
  );
}

export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 mt-2">
      <span className="text-primary text-xs shrink-0">💡</span>
      <p className="text-xs text-foreground leading-relaxed">{children}</p>
    </div>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-[hsl(var(--status-overdue)/0.3)] bg-[hsl(var(--status-overdue)/0.05)] px-3 py-2.5 mt-2">
      <span className="text-[hsl(var(--status-overdue))] text-xs shrink-0">⚠️</span>
      <p className="text-xs text-foreground leading-relaxed">{children}</p>
    </div>
  );
}

export function SubHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-foreground mt-3">{children}</p>;
}

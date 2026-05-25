// Einfache Wort-basierte Diff-Anzeige (LCS).
// Zeigt entfernte Wörter rot/durchgestrichen, hinzugefügte grün.
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

type Op = { type: 'eq' | 'del' | 'add'; text: string };

function tokenize(s: string): string[] {
  // Wörter inkl. anhängender Whitespace, damit Spacing erhalten bleibt
  const out: string[] = [];
  const re = /\S+\s*|\s+/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

function diffWords(a: string, b: string): Op[] {
  const A = tokenize(a);
  const B = tokenize(b);
  const n = A.length, m = B.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (A[i].trim() === B[j].trim() && A[i].trim().length > 0) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else if (A[i] === B[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  const ops: Op[] = [];
  let i = 0, j = 0;
  const eq = (x: string, y: string) => x === y || (x.trim() === y.trim() && x.trim().length > 0);
  while (i < n && j < m) {
    if (eq(A[i], B[j])) { ops.push({ type: 'eq', text: B[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: A[i] }); i++; }
    else { ops.push({ type: 'add', text: B[j] }); j++; }
  }
  while (i < n) { ops.push({ type: 'del', text: A[i++] }); }
  while (j < m) { ops.push({ type: 'add', text: B[j++] }); }
  return ops;
}

interface Props {
  before: string;
  after: string;
  className?: string;
}

export function TextDiffView({ before, after, className }: Props) {
  const ops = useMemo(() => diffWords(before ?? '', after ?? ''), [before, after]);
  return (
    <div
      className={cn(
        'text-[13px] leading-relaxed whitespace-pre-wrap break-words font-sans',
        className,
      )}
    >
      {ops.map((op, idx) => {
        if (op.type === 'eq') return <span key={idx}>{op.text}</span>;
        if (op.type === 'del') {
          return (
            <span
              key={idx}
              className="bg-red-500/15 text-red-400 line-through decoration-red-400/60 rounded px-0.5"
            >
              {op.text}
            </span>
          );
        }
        return (
          <span
            key={idx}
            className="bg-emerald-500/15 text-emerald-300 rounded px-0.5"
          >
            {op.text}
          </span>
        );
      })}
    </div>
  );
}

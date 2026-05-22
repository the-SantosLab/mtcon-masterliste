import { Link } from 'react-router-dom';
import { memo, useMemo } from 'react';

/**
 * Renders a chat message body with:
 * - **bold**, *italic*, `code`
 * - URLs auto-linked
 * - #VOR-YYYY-NNNN auto-linked to /cases (lookup map provided)
 * - @mentions highlighted (lookup map provided)
 * - line breaks preserved
 */
interface Props {
  body: string;
  caseNumberMap?: Record<string, string>; // case_no -> case_id
  mentionMap?: Record<string, { id: string; display_name: string }>; // short_code lowercase
  currentUserShortCode?: string | null;
  className?: string;
}

type Token =
  | { t: 'text'; v: string }
  | { t: 'url'; v: string }
  | { t: 'case'; v: string }
  | { t: 'mention'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'code'; v: string }
  | { t: 'br' };

// Inline tokenizer — single pass over the string
function tokenize(input: string): Token[] {
  const out: Token[] = [];
  const re = /(https?:\/\/[^\s)]+)|(#VOR-\d{4}-\d{4})|(@[A-Za-z0-9._-]{2,})|(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|(\n)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) out.push({ t: 'text', v: input.slice(last, m.index) });
    if (m[1]) out.push({ t: 'url', v: m[1] });
    else if (m[2]) out.push({ t: 'case', v: m[2].slice(1) });
    else if (m[3]) out.push({ t: 'mention', v: m[3].slice(1) });
    else if (m[4]) out.push({ t: 'bold', v: m[5] });
    else if (m[6]) out.push({ t: 'italic', v: m[7] });
    else if (m[8]) out.push({ t: 'code', v: m[9] });
    else if (m[10]) out.push({ t: 'br' });
    last = m.index + m[0].length;
  }
  if (last < input.length) out.push({ t: 'text', v: input.slice(last) });
  return out;
}

export const MessageContent = memo(function MessageContent({
  body, caseNumberMap = {}, mentionMap = {}, currentUserShortCode, className,
}: Props) {
  const tokens = useMemo(() => tokenize(body), [body]);
  return (
    <span className={className}>
      {tokens.map((tk, i) => {
        switch (tk.t) {
          case 'br': return <br key={i} />;
          case 'url': {
            const href = tk.v;
            return <a key={i} href={href} target="_blank" rel="noreferrer" className="text-primary underline break-all">{href}</a>;
          }
          case 'case': {
            const id = caseNumberMap[tk.v];
            if (!id) return <span key={i} className="font-mono text-primary">#{tk.v}</span>;
            return <Link key={i} to={`/cases/${id}`} className="font-mono text-primary hover:underline">#{tk.v}</Link>;
          }
          case 'mention': {
            const key = tk.v.toLowerCase();
            const user = mentionMap[key];
            const isMe = currentUserShortCode && key === currentUserShortCode.toLowerCase();
            return (
              <span
                key={i}
                className={
                  isMe
                    ? 'inline px-1 rounded bg-primary/20 text-primary font-medium'
                    : 'inline px-1 rounded bg-muted text-foreground font-medium'
                }
                title={user?.display_name}
              >@{tk.v}</span>
            );
          }
          case 'bold': return <strong key={i} className="font-semibold">{tk.v}</strong>;
          case 'italic': return <em key={i} className="italic">{tk.v}</em>;
          case 'code': return <code key={i} className="px-1 py-0.5 rounded bg-muted text-[0.95em] font-mono">{tk.v}</code>;
          case 'text': default: return <span key={i}>{tk.v}</span>;
        }
      })}
    </span>
  );
});

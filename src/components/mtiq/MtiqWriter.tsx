import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Wand2, Scissors, Check, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type TargetEl = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
type Action = 'rewrite' | 'shorten';
type Tone = 'neutral' | 'formal' | 'friendly' | 'short' | 'customer' | 'internal';

const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'neutral', label: 'Neutral / sachlich' },
  { value: 'formal', label: 'Förmlich (Sie)' },
  { value: 'friendly', label: 'Freundlich (Du)' },
  { value: 'short', label: 'Sehr knapp' },
  { value: 'customer', label: 'Kunden-E-Mail' },
  { value: 'internal', label: 'Interne Notiz' },
];

const MIN_CHARS = 15;

function isEditableTarget(el: Element | null): el is TargetEl {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    if (el.readOnly || el.disabled) return false;
    const t = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'email', 'tel'].includes(t);
  }
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function getValue(el: TargetEl): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText;
}

function setValueNative(el: TargetEl, value: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.innerText = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function getSelection(el: TargetEl): { text: string; hasSel: boolean } {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    if (e > s) return { text: el.value.slice(s, e), hasSel: true };
    return { text: el.value, hasSel: false };
  }
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length > 0) return { text: sel.toString(), hasSel: true };
  return { text: el.innerText, hasSel: false };
}

function replaceSelection(el: TargetEl, replacement: string) {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    if (e > s) {
      const next = el.value.slice(0, s) + replacement + el.value.slice(e);
      setValueNative(el, next);
      const caret = s + replacement.length;
      try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
    } else {
      setValueNative(el, replacement);
    }
  } else {
    setValueNative(el, replacement);
  }
}

export function MtiqWriter() {
  const [target, setTarget] = useState<TargetEl | null>(null);
  const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<Tone>('neutral');
  const [loading, setLoading] = useState<Action | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [selectionInfo, setSelectionInfo] = useState<{ hasSel: boolean; len: number }>({ hasSel: false, len: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastTargetRef = useRef<TargetEl | null>(null);

  // Track focused editable element
  useEffect(() => {
    const updatePos = (el: TargetEl) => {
      const r = el.getBoundingClientRect();
      // place button near bottom-right inside the element
      const top = r.bottom - 28;
      const left = r.right - 28;
      setBtnPos({ top, left });
    };

    const onFocus = (e: FocusEvent) => {
      const el = e.target as Element | null;
      if (!isEditableTarget(el)) return;
      // skip very small inputs / search bars by name
      const name = (el as HTMLElement).getAttribute('name') || '';
      const id = (el as HTMLElement).id || '';
      if (/password|otp|search|email|tel|url/i.test(name + ' ' + id)) {
        // still allow if textarea
        if (!(el instanceof HTMLTextAreaElement)) return;
      }
      lastTargetRef.current = el;
      setTarget(el);
      updatePos(el);
    };

    const onScroll = () => {
      if (lastTargetRef.current && document.body.contains(lastTargetRef.current)) {
        updatePos(lastTargetRef.current);
      }
    };

    const onBlur = (e: FocusEvent) => {
      // delay so click on our button still works
      setTimeout(() => {
        const active = document.activeElement;
        if (active && popoverRef.current?.contains(active)) return;
        if (active === btnRef.current) return;
        if (open) return;
        if (active && isEditableTarget(active as Element)) return;
        setTarget(null);
        setBtnPos(null);
      }, 150);
    };

    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', onBlur, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', onBlur, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Track selection length for label
  useEffect(() => {
    if (!target) return;
    const update = () => {
      const { hasSel, text } = getSelection(target);
      setSelectionInfo({ hasSel, len: text.trim().length });
    };
    update();
    document.addEventListener('selectionchange', update);
    target.addEventListener('keyup', update);
    target.addEventListener('mouseup', update);
    target.addEventListener('input', update);
    return () => {
      document.removeEventListener('selectionchange', update);
      target.removeEventListener('keyup', update);
      target.removeEventListener('mouseup', update);
      target.removeEventListener('input', update);
    };
  }, [target]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setResult(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const btnRef = useRef<HTMLButtonElement>(null);

  const visible = !!target && !!btnPos && selectionInfo.len >= MIN_CHARS;
  if (!visible && !open) {
    // hide
  }

  const runAction = async (action: Action) => {
    if (!target) return;
    const { text } = getSelection(target);
    if (text.trim().length < MIN_CHARS) {
      toast.error(`Mindestens ${MIN_CHARS} Zeichen für MTIQ.`);
      return;
    }
    setLoading(action);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('mtiq-write', {
        body: { text, action, tone },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult((data as any).text);
    } catch (e: any) {
      toast.error(e?.message ?? 'MTIQ konnte nicht antworten');
    } finally {
      setLoading(null);
    }
  };

  const apply = () => {
    if (!target || !result) return;
    replaceSelection(target, result);
    toast.success('Übernommen');
    setOpen(false);
    setResult(null);
  };

  const popoverPos = (() => {
    if (!btnPos) return null;
    const W = 360;
    const H = 380;
    let left = btnPos.left - W + 28;
    let top = btnPos.top + 36;
    if (left < 8) left = 8;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    if (top + H > window.innerHeight - 8) top = btnPos.top - H - 8;
    if (top < 8) top = 8;
    return { top, left };
  })();

  return createPortal(
    <>
      {visible && (
        <button
          ref={btnRef}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setOpen((o) => !o);
            setResult(null);
          }}
          title="MTIQ – Text umformulieren oder kürzen"
          style={{ position: 'fixed', top: btnPos!.top, left: btnPos!.left, zIndex: 9998 }}
          className={cn(
            'h-6 w-6 rounded-full flex items-center justify-center',
            'bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg',
            'hover:scale-110 transition-transform',
            open && 'ring-2 ring-white/40',
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
        </button>
      )}

      {open && popoverPos && target && (
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: popoverPos.top, left: popoverPos.left, width: 360, zIndex: 9999 }}
          className="rounded-xl border border-border bg-popover/95 backdrop-blur-xl shadow-2xl text-popover-foreground"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-xs font-semibold">MTIQ Schreibassistent</span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {selectionInfo.hasSel ? `${selectionInfo.len} Z. markiert` : `${selectionInfo.len} Z.`}
            </span>
            <button
              type="button"
              onClick={() => { setOpen(false); setResult(null); }}
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted/60"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="px-3 py-2.5 space-y-2.5">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Tonalität
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as Tone)}
                className="ml-auto h-7 text-xs rounded-md border border-border bg-background px-2"
              >
                {TONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!!loading}
                onClick={() => runAction('rewrite')}
                className="h-9 rounded-md border border-border bg-background hover:bg-muted/60 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loading === 'rewrite' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                Umformulieren
              </button>
              <button
                type="button"
                disabled={!!loading}
                onClick={() => runAction('shorten')}
                className="h-9 rounded-md border border-border bg-background hover:bg-muted/60 text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {loading === 'shorten' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scissors className="h-3.5 w-3.5" />}
                Kürzen
              </button>
            </div>

            {result && (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Vorschlag</div>
                <textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={8}
                  className="w-full text-xs rounded-md border border-border bg-background p-2 resize-none font-mono"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={apply}
                    className="flex-1 h-8 rounded-md bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 hover:opacity-90"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {selectionInfo.hasSel ? 'Auswahl ersetzen' : 'Übernehmen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="h-8 px-3 rounded-md border border-border text-xs hover:bg-muted/60"
                  >
                    Verwerfen
                  </button>
                </div>
              </div>
            )}

            {!result && !loading && (
              <div className="text-[10px] text-muted-foreground leading-relaxed">
                Markiere optional einen Textabschnitt. Ohne Auswahl wird das ganze Feld bearbeitet. Mindestens {MIN_CHARS} Zeichen.
              </div>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}

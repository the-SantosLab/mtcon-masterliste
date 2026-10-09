import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';

type LogRow = {
  id: string; email_type: 'status_query' | 'delivery_delay'; recipient_email: string | null; recipient_name: string | null;
  status: 'sent' | 'failed' | 'no_recipient'; manual: boolean; sent_at: string; subject: string | null;
};

const TYPE_LABEL = { status_query: 'Statusabfrage', delivery_delay: 'Verzugsmeldung' } as const;
const STATUS_LABEL = { sent: 'Versendet', failed: 'Fehlgeschlagen', no_recipient: 'Keine E-Mail – Klärungsfall' } as const;

async function invokeSend(poId: string, type: 'status_query' | 'delivery_delay') {
  const { data, error } = await supabase.functions.invoke('po-supplier-reminders', { body: { po_id: poId, email_type: type } });
  if (error) {
    const j = await (error as any).context?.json?.().catch(() => null);
    throw new Error(j?.error ?? error.message);
  }
  return data?.result as string;
}

/** Supplier email history, clarification flag and manual send for one purchase order. */
export function PoSupplierEmails({ po, onChanged }: {
  po: { id: string; status: string; confirmed_delivery_date?: string | null; needs_clarification?: boolean | null; clarification_reason?: string | null };
  onChanged: () => void;
}) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await (supabase as any).from('purchase_order_email_logs')
      .select('id,email_type,recipient_email,recipient_name,status,manual,sent_at,subject')
      .eq('po_id', po.id).order('sent_at', { ascending: false });
    setLogs(data ?? []);
  }, [po.id]);
  useEffect(() => { load(); }, [load]);

  const open = po.status === 'ordered' || po.status === 'partial';
  const send = async (type: 'status_query' | 'delivery_delay') => {
    if (!confirm(`${TYPE_LABEL[type]} jetzt an den Lieferanten senden?`)) return;
    setBusy(true);
    try {
      const r = await invokeSend(po.id, type);
      if (r === 'sent') toast.success('E-Mail versendet');
      else if (r === 'no_recipient') toast.error('Keine E-Mail-Adresse beim Lieferanten – als Klärungsfall markiert');
      else toast.error('Versand fehlgeschlagen');
      await load(); onChanged();
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div className="rounded border border-border p-3 space-y-2 bg-muted/10">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lieferanten-E-Mails</div>
        {open && po.confirmed_delivery_date && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => send('status_query')}>Statusabfrage senden</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => send('delivery_delay')}>Verzugsmeldung senden</Button>
          </div>
        )}
      </div>
      {po.needs_clarification && (
        <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs text-foreground">
          <span className="font-medium">Klärungsfall:</span> {po.clarification_reason ?? 'Ansprechpartner oder E-Mail fehlt'}.
          {' '}Nach Eintragen der E-Mail beim Lieferanten erneut senden.
        </div>
      )}
      {!po.confirmed_delivery_date && open && (
        <p className="text-xs text-muted-foreground">Automatik aktiv, sobald ein zugesagter Liefertermin eingetragen ist.</p>
      )}
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Noch keine E-Mails versendet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase text-muted-foreground">
            <tr><th className="text-left py-1">Datum</th><th className="text-left">Art</th><th className="text-left">Empfänger</th><th className="text-left">Ergebnis</th></tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t border-border">
                <td className="py-1">{new Date(l.sent_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{TYPE_LABEL[l.email_type]}{l.manual ? ' (manuell)' : ''}</td>
                <td className="text-muted-foreground">{l.recipient_email ?? '–'}</td>
                <td className={l.status === 'sent' ? '' : 'text-destructive'}>{STATUS_LABEL[l.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Editor for the two supplier email templates. */
export function PoEmailTemplatesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Record<string, { subject: string; body: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    (supabase as any).from('purchase_email_templates').select('email_type,subject,body').then(({ data }: any) => {
      setRows(Object.fromEntries((data ?? []).map((r: any) => [r.email_type, { subject: r.subject, body: r.body }])));
    });
  }, [open]);
  const save = async () => {
    setSaving(true);
    for (const [type, v] of Object.entries(rows)) {
      const { error } = await (supabase as any).from('purchase_email_templates')
        .update({ subject: v.subject, body: v.body, updated_at: new Date().toISOString() }).eq('email_type', type);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    setSaving(false); toast.success('Vorlagen gespeichert'); onClose();
  };
  const set = (t: string, k: 'subject' | 'body', v: string) => setRows(r => ({ ...r, [t]: { ...r[t], [k]: v } }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>E-Mail-Vorlagen Lieferanten</DialogTitle>
          <DialogDescription>Platzhalter: {'{{po_no}} {{supplier_name}} {{contact_name}} {{delivery_date}} {{items}}'}</DialogDescription>
        </DialogHeader>
        {(['status_query', 'delivery_delay'] as const).map(t => rows[t] && (
          <div key={t} className="space-y-1.5">
            <div className="text-xs font-medium">{t === 'status_query' ? 'Statusabfrage (14 Tage vor Liefertermin)' : 'Verzugsmeldung (Liefertermin überschritten)'}</div>
            <Input value={rows[t].subject} onChange={e => set(t, 'subject', e.target.value)} className="h-8 text-xs" />
            <Textarea value={rows[t].body} onChange={e => set(t, 'body', e.target.value)} rows={9} className="text-xs" />
          </div>
        ))}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={save} disabled={saving}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const FN_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-offer`;

export default function PublicOffer() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ actor_name: '', actor_email: '', comment: '' });
  const [submitting, setSubmitting] = useState<null | 'accept' | 'reject'>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${FN_URL}?token=${token}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        setData(j);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const submit = async (action: 'accept' | 'reject') => {
    if (!form.actor_name || !form.actor_email) { toast.error('Name und E-Mail erforderlich'); return; }
    setSubmitting(action);
    const r = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, action, ...form }),
    });
    const j = await r.json();
    setSubmitting(null);
    if (!r.ok) { toast.error(j.error ?? 'Fehler'); return; }
    toast.success(action === 'accept' ? 'Angebot angenommen' : 'Angebot abgelehnt');
    location.reload();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-sm text-destructive">{error}</div>;
  if (!data) return null;

  const o = data.offer;
  const decided = o.accepted_at || o.rejected_at;
  const items = data.items as any[];
  const sum = items.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_price) * (1 - Number(i.discount_pct ?? 0) / 100), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Angebot</div>
              <h1 className="text-xl font-semibold mt-0.5">{o.offer_no} {o.version > 1 && <span className="text-xs text-muted-foreground">v{o.version}</span>}</h1>
              {data.company && <p className="text-sm text-muted-foreground mt-1">{data.company.name}</p>}
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold">{sum.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div>
              {o.valid_until && <div className="text-xs text-muted-foreground mt-1">gültig bis {new Date(o.valid_until).toLocaleDateString('de-DE')}</div>}
            </div>
          </div>
          {o.notes && <p className="text-sm whitespace-pre-wrap text-muted-foreground border-t border-border pt-3">{o.notes}</p>}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold mb-3">Positionen</h2>
          <div className="space-y-2">
            {items.map((i, idx) => {
              const lt = Number(i.quantity) * Number(i.unit_price) * (1 - Number(i.discount_pct ?? 0) / 100);
              return (
                <div key={idx} className="flex items-baseline justify-between text-sm border-b border-border/40 pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{i.description}</div>
                    {i.art_nr && <div className="text-[10px] text-muted-foreground">{i.art_nr}</div>}
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    {i.quantity} × {Number(i.unit_price).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    <div className="text-sm font-medium text-foreground">{lt.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {decided ? (
          <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3">
            {o.accepted_at
              ? <><CheckCircle2 className="h-5 w-5 text-green-500" /><div className="text-sm">Dieses Angebot wurde am {new Date(o.accepted_at).toLocaleDateString('de-DE')} angenommen.</div></>
              : <><XCircle className="h-5 w-5 text-destructive" /><div className="text-sm">Dieses Angebot wurde am {new Date(o.rejected_at).toLocaleDateString('de-DE')} abgelehnt.</div></>}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <h2 className="text-sm font-semibold">Ihre Entscheidung</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-[11px]">Name *</Label><Input value={form.actor_name} onChange={e => setForm({ ...form, actor_name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-[11px]">E-Mail *</Label><Input type="email" value={form.actor_email} onChange={e => setForm({ ...form, actor_email: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-[11px]">Kommentar (optional)</Label><Textarea rows={3} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => submit('accept')} disabled={!!submitting} className="flex-1">
                {submitting === 'accept' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Angebot annehmen'}
              </Button>
              <Button variant="outline" onClick={() => submit('reject')} disabled={!!submitting} className="flex-1">
                {submitting === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ablehnen'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Mit der Annahme bestätigen Sie verbindlich die Beauftragung gemäß obigen Konditionen.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { unitPrice } from '@/lib/workshopLoad';

const db = supabase as any;
const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 3 });
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 });

/** Artikelbezug eines Vorgangs: Bestand, Stückpreis (nur bei gültiger PE), offene Aufträge/Werkstattaufträge/Bestellungen. */
export function CaseArticleInfo({ artNr }: { artNr: string | null | undefined }) {
  const [d, setD] = useState<any>(undefined);
  useEffect(() => {
    const a = (artNr || '').trim();
    if (!a) { setD(undefined); return; }
    (async () => {
      const [art, st, pr, oi, wo, po] = await Promise.all([
        db.from('articles').select('art_nr, bezeich_1, me, pe').eq('art_nr', a).maybeSingle(),
        db.from('inventory_stock').select('quantity, reserved_qty').eq('art_nr', a),
        db.from('article_prices').select('durchschnittspreis, standardpreis, einkaufspreis').eq('art_nr', a).maybeSingle(),
        db.from('order_items').select('quantity, qty_delivered, orders!inner(status)').eq('art_nr', a).limit(500),
        db.from('production_orders').select('quantity, quantity_done, status').eq('art_nr', a).not('status', 'in', '(completed,cancelled)'),
        db.from('purchase_order_items').select('qty_ordered, qty_received, purchase_orders!inner(status)').eq('art_nr', a).limit(500),
      ]);
      if (!art.data) { setD(null); return; }
      const p = pr.data ? (pr.data.durchschnittspreis ?? pr.data.standardpreis ?? pr.data.einkaufspreis) : null;
      const openOrders = (oi.data ?? []).filter((r: any) => !['cancelled', 'storniert', 'completed', 'abgeschlossen'].includes(r.orders?.status) && Number(r.quantity) > Number(r.qty_delivered ?? 0));
      const openPo = (po.data ?? []).filter((r: any) => !['cancelled', 'received'].includes(r.purchase_orders?.status) && Number(r.qty_ordered) > Number(r.qty_received ?? 0));
      setD({
        art: art.data,
        stock: (st.data ?? []).reduce((s: number, r: any) => s + Number(r.quantity ?? 0), 0),
        reserved: (st.data ?? []).reduce((s: number, r: any) => s + Number(r.reserved_qty ?? 0), 0),
        price: unitPrice(p, art.data.pe),
        orders: openOrders.length, ordersQty: openOrders.reduce((s: number, r: any) => s + Number(r.quantity) - Number(r.qty_delivered ?? 0), 0),
        wos: (wo.data ?? []).length, woQty: (wo.data ?? []).reduce((s: number, r: any) => s + Number(r.quantity) - Number(r.quantity_done), 0),
        pos: openPo.length, poQty: openPo.reduce((s: number, r: any) => s + Number(r.qty_ordered) - Number(r.qty_received ?? 0), 0),
      });
    })();
  }, [artNr]);

  if (d === undefined) return null;
  if (d === null) return <p className="text-[11px] text-muted-foreground mt-3">Artikelnummer „{artNr}“ ist nicht im Artikelstamm.</p>;
  const me = d.art.me || 'Stk';
  return (
    <div className="mt-4 rounded-md border border-border/60 p-3">
      <div className="flex flex-wrap items-baseline gap-2 text-xs mb-2">
        <span className="font-mono">{d.art.art_nr}</span><span className="text-muted-foreground">{d.art.bezeich_1}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <Kv k="Bestand" v={`${fmt(d.stock)} ${me}`} s={d.reserved ? `${fmt(d.reserved)} reserviert` : undefined} />
        <Kv k="Stückpreis" v={d.price.price != null ? eur(d.price.price) : d.price.unclear ? 'Preiseinheit unklar' : '–'} />
        <Kv k="Offene Aufträge" v={String(d.orders)} s={d.orders ? `${fmt(d.ordersQty)} ${me} offen` : undefined} />
        <Kv k="Werkstattaufträge" v={String(d.wos)} s={d.wos ? `${fmt(d.woQty)} ${me} offen` : undefined} />
        <Kv k="Offene Bestellungen" v={String(d.pos)} s={d.pos ? `${fmt(d.poQty)} ${me} erwartet` : undefined} />
      </div>
      <Link to={`/admin/articles?art=${encodeURIComponent(d.art.art_nr)}`} className="text-[11px] text-primary hover:underline mt-2 inline-block">Zum Artikel</Link>
    </div>
  );
}

function Kv({ k, v, s }: { k: string; v: string; s?: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{k}</p><p className="tabular-nums font-medium">{v}</p>{s && <p className="text-[10px] text-muted-foreground">{s}</p>}</div>;
}

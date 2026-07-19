import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { CrmLayout } from '@/components/CrmLayout';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Loader2, Save, Plus, Trash2, GripVertical, ChevronDown, FileDown, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatEUR } from '@/lib/crm';
import { generateOfferPdf } from '@/lib/crm-pdf';
import { ErpDocPdfButton } from '@/components/ErpDocPdfButton';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Item { id: string; product_id?: string | null; description: string; quantity: number; unit_price: number; discount_pct: number; sort_order: number; _new?: boolean; }

const STATUS_LABEL: Record<string, string> = { entwurf: 'Entwurf', versendet: 'Versendet', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt', abgelaufen: 'Abgelaufen' };
const STATUS_COLOR: Record<string, string> = {
  entwurf: 'hsl(var(--status-open))', versendet: 'hsl(var(--status-working))',
  angenommen: 'hsl(var(--status-done))', abgelehnt: 'hsl(var(--status-rejected))', abgelaufen: 'hsl(var(--status-overdue))',
};

export default function CrmOfferDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [offer, setOffer] = useState<any>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [priceItems, setPriceItems] = useState<any[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => { void load(); }, [id]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: o } = await supabase.from('offers').select('*, deals(id, title, deal_no, company_id, primary_contact_id)').eq('id', id).single();
    if (!o) { setLoading(false); return; }
    // hydrate company/contact defaults from deal if missing
    const initial = { ...o };
    if (!initial.company_id && o.deals?.company_id) initial.company_id = o.deals.company_id;
    if (!initial.primary_contact_id && o.deals?.primary_contact_id) initial.primary_contact_id = o.deals.primary_contact_id;
    setOffer(initial);

    const [{ data: its }, { data: pr }, { data: co }, { data: ct }, { data: pl }, { data: vs }] = await Promise.all([
      supabase.from('offer_items').select('*').eq('offer_id', id).order('sort_order'),
      supabase.from('products').select('id, code, name').order('name'),
      supabase.from('companies').select('id, name').order('name'),
      supabase.from('contacts').select('id, first_name, last_name, company_id').order('last_name'),
      supabase.from('price_list_items').select('*').eq('is_active', true),
      supabase.from('offers').select('id, offer_no, version, status, created_at').or(`id.eq.${id},parent_offer_id.eq.${id},parent_offer_id.eq.${o.parent_offer_id ?? id}`).order('version'),
    ]);
    setItems((its ?? []).map(i => ({ ...i, quantity: Number(i.quantity), unit_price: Number(i.unit_price), discount_pct: Number(i.discount_pct) })));
    setProducts(pr ?? []); setCompanies(co ?? []); setContacts(ct ?? []); setPriceItems(pl ?? []);
    setVersions(vs ?? []);
    setLoading(false);
  };

  const totals = useMemo(() => {
    const net = items.reduce((s, it) => s + it.quantity * it.unit_price * (1 - (it.discount_pct || 0) / 100), 0);
    return { net, vat: net * 0.19, gross: net * 1.19 };
  }, [items]);

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const onProductSelect = (idx: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    const pi = priceItems.find(x => x.product_id === productId && x.customer_tier === 'standard');
    updateItem(idx, {
      product_id: productId,
      description: p ? `${p.code} · ${p.name}` : items[idx].description,
      unit_price: pi ? Number(pi.price) : items[idx].unit_price,
    });
  };

  const addItem = () => setItems(p => [...p, { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, discount_pct: 0, sort_order: p.length, _new: true }]);
  const removeItem = (idx: number) => setItems(p => p.filter((_, i) => i !== idx));

  const onDragEnd = (e: any) => {
    if (!e.over || e.active.id === e.over.id) return;
    setItems(prev => {
      const oldIdx = prev.findIndex(i => i.id === e.active.id);
      const newIdx = prev.findIndex(i => i.id === e.over.id);
      return arrayMove(prev, oldIdx, newIdx).map((it, i) => ({ ...it, sort_order: i }));
    });
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const total = totals.gross;
    const { error: oe } = await supabase.from('offers').update({
      company_id: offer.company_id || null,
      primary_contact_id: offer.primary_contact_id || null,
      delivery_address: offer.delivery_address || null,
      payment_terms: offer.payment_terms || null,
      notes: offer.notes || null,
      valid_until: offer.valid_until || null,
      total,
    }).eq('id', id);
    if (oe) { setSaving(false); toast.error(oe.message); return; }
    // delete existing items, re-insert
    await supabase.from('offer_items').delete().eq('offer_id', id);
    if (items.length) {
      const { error: ie } = await supabase.from('offer_items').insert(items.map((it, i) => ({
        offer_id: id, product_id: it.product_id || null, description: it.description,
        quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct, sort_order: i,
      })));
      if (ie) { setSaving(false); toast.error(ie.message); return; }
    }
    setSaving(false); toast.success('Gespeichert'); void load();
  };

  const setStatus = async (status: string) => {
    const patch: any = { status };
    if (status === 'versendet') patch.sent_at = new Date().toISOString();
    if (status === 'angenommen') patch.accepted_at = new Date().toISOString();
    if (status === 'abgelehnt') patch.rejected_at = new Date().toISOString();
    const { error } = await supabase.from('offers').update(patch).eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status: ${STATUS_LABEL[status]}`);
    void load();
  };

  const exportPdf = () => {
    const company = companies.find(c => c.id === offer.company_id);
    const contact = contacts.find(c => c.id === offer.primary_contact_id);
    const doc = generateOfferPdf({
      offer_no: offer.offer_no,
      created_at: offer.created_at,
      valid_until: offer.valid_until,
      version: offer.version,
      company_name: company?.name,
      contact_name: contact ? `${contact.first_name} ${contact.last_name}` : undefined,
      delivery_address: offer.delivery_address,
      items: items.map(it => ({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct })),
      payment_terms: offer.payment_terms,
      notes: offer.notes,
    });
    doc.save(`${offer.offer_no}_v${offer.version}.pdf`);
  };

  const createShareLink = async () => {
    if (!id) return;
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);
    const expires = new Date(); expires.setDate(expires.getDate() + 30);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('offer_share_tokens').insert({
      offer_id: id, token, expires_at: expires.toISOString(), created_by: u.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    const url = `${location.origin}/p/offer/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Freigabe-Link kopiert (30 Tage gültig)');
  };



  const newVersion = async () => {
    if (!id) return;
    setSaving(true);
    const parent = offer.parent_offer_id ?? id;
    const { data: siblings } = await supabase.from('offers').select('version').or(`id.eq.${parent},parent_offer_id.eq.${parent}`);
    const nextV = Math.max(...(siblings ?? []).map(s => s.version || 1), 1) + 1;
    const { data: u } = await supabase.auth.getUser();
    const { data: newOffer, error } = await supabase.from('offers').insert({
      deal_id: offer.deal_id, company_id: offer.company_id, primary_contact_id: offer.primary_contact_id,
      delivery_address: offer.delivery_address, payment_terms: offer.payment_terms, notes: offer.notes,
      valid_until: offer.valid_until, status: 'entwurf', total: offer.total,
      version: nextV, parent_offer_id: parent, owner_id: u.user?.id,
    }).select('id').single();
    if (error) { setSaving(false); toast.error(error.message); return; }
    if (items.length) {
      await supabase.from('offer_items').insert(items.map((it, i) => ({
        offer_id: newOffer!.id, product_id: it.product_id || null, description: it.description,
        quantity: it.quantity, unit_price: it.unit_price, discount_pct: it.discount_pct, sort_order: i,
      })));
    }
    setSaving(false);
    toast.success(`Version ${nextV} erstellt`);
    nav(`/crm/offers/${newOffer!.id}`);
  };

  if (loading) return <CrmLayout><div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div></CrmLayout>;
  if (!offer) return <CrmLayout><p className="text-sm text-muted-foreground">Angebot nicht gefunden.</p></CrmLayout>;

  const filteredContacts = contacts.filter(c => !offer.company_id || c.company_id === offer.company_id);

  return (
    <CrmLayout>
      <button onClick={() => nav('/crm/offers')} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Zurück zur Liste
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] text-muted-foreground tabular-nums">{offer.offer_no} · v{offer.version}</p>
          <h1 className="text-xl font-semibold">Angebot</h1>
          {offer.deals && <Link to={`/crm/deals/${offer.deal_id}`} className="text-xs text-primary hover:underline">Deal: {offer.deals.title}</Link>}
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded text-[11px] font-semibold uppercase text-white" style={{ background: STATUS_COLOR[offer.status] }}>
            {STATUS_LABEL[offer.status]}
          </span>
          <ErpDocPdfButton type="angebot" id={id!} />
          <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={exportPdf} title="Alte einfache Version"><FileDown className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={createShareLink}><Link2 className="h-3.5 w-3.5" /> Freigabe-Link</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 text-xs gap-1">Aktionen <ChevronDown className="h-3 w-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setStatus('versendet')}>Versenden</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus('angenommen')}>Angenommen</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatus('abgelehnt')}>Abgelehnt</DropdownMenuItem>
              <DropdownMenuItem onClick={newVersion}>Neue Version</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card/40 p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Kunde</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Unternehmen</Label>
            <Select value={offer.company_id ?? ''} onValueChange={v => setOffer({ ...offer, company_id: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Ansprechpartner</Label>
            <Select value={offer.primary_contact_id ?? ''} onValueChange={v => setOffer({ ...offer, primary_contact_id: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Wählen…" /></SelectTrigger>
              <SelectContent>{filteredContacts.map(c => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-[11px] text-muted-foreground">Lieferadresse</Label>
            <Textarea value={offer.delivery_address ?? ''} onChange={e => setOffer({ ...offer, delivery_address: e.target.value })} className="text-xs min-h-[60px]" />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/40 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Positionen</h2>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Zeile</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="w-6"></th>
                <th className="px-2 py-1 font-medium w-44">Artikel</th>
                <th className="px-2 py-1 font-medium">Beschreibung</th>
                <th className="px-2 py-1 font-medium text-right w-20">Menge</th>
                <th className="px-2 py-1 font-medium text-right w-28">Einzelpreis</th>
                <th className="px-2 py-1 font-medium text-right w-20">Rabatt %</th>
                <th className="px-2 py-1 font-medium text-right w-28">Gesamt</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {items.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Keine Positionen.</td></tr>}
                  {items.map((it, idx) => (
                    <SortableRow key={it.id} item={it} idx={idx} products={products} onProductSelect={onProductSelect} updateItem={updateItem} removeItem={removeItem} />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
        <div className="flex justify-end mt-4">
          <div className="text-xs space-y-1 min-w-[220px]">
            <div className="flex justify-between"><span className="text-muted-foreground">Netto</span><span className="tabular-nums">{formatEUR(totals.net)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">MwSt (19%)</span><span className="tabular-nums">{formatEUR(totals.vat)}</span></div>
            <div className="flex justify-between font-semibold pt-1 border-t border-border"><span>Brutto</span><span className="tabular-nums">{formatEUR(totals.gross)}</span></div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/40 p-4 mb-4">
        <h2 className="text-sm font-semibold mb-3">Konditionen</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground">Gültig bis</Label>
            <Input type="date" value={offer.valid_until ?? ''} onChange={e => setOffer({ ...offer, valid_until: e.target.value })} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-[11px] text-muted-foreground">Zahlungsbedingungen</Label>
            <Input value={offer.payment_terms ?? ''} onChange={e => setOffer({ ...offer, payment_terms: e.target.value })} className="h-8 text-xs" placeholder="z.B. 30 Tage netto" />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-[11px] text-muted-foreground">Anmerkungen</Label>
            <Textarea value={offer.notes ?? ''} onChange={e => setOffer({ ...offer, notes: e.target.value })} className="text-xs min-h-[60px]" />
          </div>
        </div>
      </section>

      {versions.length > 1 && (
        <section className="rounded-lg border border-border bg-card/40 p-4 mb-4">
          <h2 className="text-sm font-semibold mb-2">Versions-History</h2>
          <ul className="text-xs space-y-1">
            {versions.map(v => (
              <li key={v.id}>
                <Link to={`/crm/offers/${v.id}`} className={v.id === id ? 'text-foreground font-semibold' : 'text-primary hover:underline'}>
                  v{v.version} · {STATUS_LABEL[v.status]} · {new Date(v.created_at).toLocaleDateString('de-DE')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Button onClick={save} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Speichern
      </Button>
    </CrmLayout>
  );
}

function SortableRow({ item, idx, products, onProductSelect, updateItem, removeItem }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const line = item.quantity * item.unit_price * (1 - (item.discount_pct || 0) / 100);
  return (
    <tr ref={setNodeRef} style={style} className="border-t border-border/40">
      <td><button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab"><GripVertical className="h-3.5 w-3.5" /></button></td>
      <td className="px-2 py-1">
        <Select value={item.product_id ?? ''} onValueChange={v => onProductSelect(idx, v)}>
          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="–" /></SelectTrigger>
          <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.code} · {p.name}</SelectItem>)}</SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1"><Input value={item.description} onChange={e => updateItem(idx, { description: e.target.value })} className="h-7 text-xs" /></td>
      <td className="px-2 py-1"><Input type="number" value={item.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
      <td className="px-2 py-1"><Input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, { unit_price: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
      <td className="px-2 py-1"><Input type="number" value={item.discount_pct} onChange={e => updateItem(idx, { discount_pct: Number(e.target.value) })} className="h-7 text-xs text-right" /></td>
      <td className="px-2 py-1 text-right tabular-nums">{formatEUR(line)}</td>
      <td><button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
    </tr>
  );
}

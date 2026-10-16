// Maps positions of an earlier offer or order onto new offer lines (appended after existing lines).
export interface CopiedItem { id: string; product_id?: string | null; art_nr?: string | null; description: string; quantity: number; unit_price: number; discount_pct: number; sort_order: number; _new: true }

export function copyItems(source: 'offer' | 'order', rows: any[], startAt: number, newId: () => string = () => crypto.randomUUID()): CopiedItem[] {
  return [...rows]
    .sort((a, b) => Number(a.sort_order ?? a.position ?? 0) - Number(b.sort_order ?? b.position ?? 0))
    .map((r, i) => ({
      id: newId(),
      product_id: source === 'offer' ? r.product_id ?? null : null,
      art_nr: r.art_nr ?? r.sku ?? null,
      description: r.description ?? '',
      quantity: Number(r.quantity) || 0,
      unit_price: Number(r.unit_price) || 0,
      discount_pct: source === 'offer' ? Number(r.discount_pct) || 0 : 0,
      sort_order: startAt + i,
      _new: true as const,
    }));
}


CREATE OR REPLACE FUNCTION public.get_disposition_overview()
RETURNS TABLE(
  art_nr text,
  bezeich_1 text,
  me text,
  on_hand numeric,
  reserved numeric,
  open_demand numeric,
  open_supply numeric,
  reorder_point numeric,
  net_available numeric,
  shortage numeric,
  suggested_qty numeric,
  primary_lief_nr text,
  primary_supplier_name text,
  primary_price numeric,
  primary_lieferzeit numeric,
  second_lief_nr text,
  second_supplier_name text,
  second_price numeric,
  second_lieferzeit numeric,
  best_lief_nr text,
  best_supplier_name text,
  best_price numeric,
  savings numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH stock AS (
  SELECT art_nr,
    COALESCE(SUM(bestand),0) AS on_hand,
    COALESCE(SUM(sb_menge),0) AS reserved
  FROM article_stock_locations
  GROUP BY art_nr
),
demand AS (
  SELECT oi.art_nr,
    COALESCE(SUM(GREATEST(oi.quantity - COALESCE(oi.qty_delivered,0), 0)),0) AS open_demand
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.art_nr IS NOT NULL
    AND LOWER(COALESCE(o.status::text,'')) NOT IN ('completed','cancelled','closed','delivered','done','abgeschlossen','storniert')
  GROUP BY oi.art_nr
),
supply AS (
  SELECT poi.art_nr,
    COALESCE(SUM(GREATEST(poi.qty_ordered - COALESCE(poi.qty_received,0), 0)),0) AS open_supply
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.po_id
  WHERE poi.art_nr IS NOT NULL
    AND LOWER(COALESCE(po.status::text,'')) NOT IN ('completed','cancelled','closed','received','done','abgeschlossen','storniert')
  GROUP BY poi.art_nr
),
suppliers_ranked AS (
  SELECT asr.art_nr, asr.lief_nr, asr.name_1 AS supplier_name,
         asr.lb_preis, asr.lieferzeit, asr.folge,
         ROW_NUMBER() OVER (
           PARTITION BY asr.art_nr
           ORDER BY
             CASE WHEN asr.folge ~ '^[0-9]+$' THEN asr.folge::int ELSE 999 END,
             asr.lb_preis NULLS LAST
         ) AS rnk
  FROM article_supplier_refs asr
),
primary_s AS ( SELECT * FROM suppliers_ranked WHERE rnk = 1 ),
second_s  AS ( SELECT * FROM suppliers_ranked WHERE rnk = 2 )
SELECT
  a.art_nr,
  a.bezeich_1,
  a.me,
  COALESCE(st.on_hand,0) AS on_hand,
  COALESCE(st.reserved,0) AS reserved,
  COALESCE(d.open_demand,0) AS open_demand,
  COALESCE(sp.open_supply,0) AS open_supply,
  COALESCE(a.mb_menge,0) AS reorder_point,
  (COALESCE(st.on_hand,0) - COALESCE(st.reserved,0) - COALESCE(d.open_demand,0) + COALESCE(sp.open_supply,0)) AS net_available,
  GREATEST(0,
    COALESCE(a.mb_menge,0)
    - (COALESCE(st.on_hand,0) - COALESCE(st.reserved,0) - COALESCE(d.open_demand,0) + COALESCE(sp.open_supply,0))
  ) AS shortage,
  CASE
    WHEN COALESCE(a.mb_menge,0) <= 0 THEN 0
    ELSE
      CEIL(
        GREATEST(0,
          COALESCE(a.mb_menge,0)
          - (COALESCE(st.on_hand,0) - COALESCE(st.reserved,0) - COALESCE(d.open_demand,0) + COALESCE(sp.open_supply,0))
        ) / NULLIF(GREATEST(COALESCE(a.verp_mg,1),1),0)
      ) * GREATEST(COALESCE(a.verp_mg,1),1)
  END AS suggested_qty,
  p.lief_nr, p.supplier_name, p.lb_preis, p.lieferzeit,
  s2.lief_nr, s2.supplier_name, s2.lb_preis, s2.lieferzeit,
  CASE WHEN s2.lb_preis IS NOT NULL AND p.lb_preis IS NOT NULL AND s2.lb_preis < p.lb_preis
       THEN s2.lief_nr ELSE p.lief_nr END,
  CASE WHEN s2.lb_preis IS NOT NULL AND p.lb_preis IS NOT NULL AND s2.lb_preis < p.lb_preis
       THEN s2.supplier_name ELSE p.supplier_name END,
  CASE WHEN s2.lb_preis IS NOT NULL AND p.lb_preis IS NOT NULL AND s2.lb_preis < p.lb_preis
       THEN s2.lb_preis ELSE p.lb_preis END,
  CASE WHEN s2.lb_preis IS NOT NULL AND p.lb_preis IS NOT NULL AND s2.lb_preis < p.lb_preis
       THEN (p.lb_preis - s2.lb_preis) ELSE 0 END
FROM articles a
LEFT JOIN stock st ON st.art_nr = a.art_nr
LEFT JOIN demand d ON d.art_nr = a.art_nr
LEFT JOIN supply sp ON sp.art_nr = a.art_nr
LEFT JOIN primary_s p ON p.art_nr = a.art_nr
LEFT JOIN second_s s2 ON s2.art_nr = a.art_nr
WHERE COALESCE(a.is_blocked,false) = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_disposition_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_po_from_suggestions(
  _supplier_lief_nr text,
  _supplier_name text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_id uuid;
  v_po_id uuid;
  v_po_no text;
  v_item jsonb;
  v_pos int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT id INTO v_supplier_id FROM suppliers WHERE code = _supplier_lief_nr LIMIT 1;
  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (code, name, is_active)
    VALUES (_supplier_lief_nr, COALESCE(_supplier_name, _supplier_lief_nr), true)
    RETURNING id INTO v_supplier_id;
  END IF;

  v_po_no := 'PO-' || to_char(now(),'YYYYMMDD') || '-' || lpad((floor(random()*10000))::text,4,'0');

  INSERT INTO purchase_orders (po_no, supplier_id, status, ordered_at, notes, created_by)
  VALUES (v_po_no, v_supplier_id, 'draft', now(), 'Erstellt aus Dispositions-Vorschlag', auth.uid())
  RETURNING id INTO v_po_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_pos := v_pos + 10;
    INSERT INTO purchase_order_items (po_id, position, art_nr, description, qty_ordered, qty_received, unit_price)
    VALUES (
      v_po_id, v_pos,
      v_item->>'art_nr',
      COALESCE(v_item->>'description', v_item->>'art_nr'),
      COALESCE((v_item->>'qty')::numeric, 0),
      0,
      NULLIF(v_item->>'unit_price','')::numeric
    );
  END LOOP;

  RETURN v_po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_po_from_suggestions(text, text, jsonb) TO authenticated;

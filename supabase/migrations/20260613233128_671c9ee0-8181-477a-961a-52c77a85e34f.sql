
CREATE OR REPLACE FUNCTION public.suggest_po_from_deal(_deal_id uuid)
RETURNS TABLE(
  art_nr text,
  description text,
  qty_needed numeric,
  on_hand numeric,
  qty_to_order numeric,
  lief_nr text,
  supplier_name text,
  unit_price numeric,
  lieferzeit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH items AS (
    SELECT
      COALESCE(p.code, di.description) AS art_nr_guess,
      COALESCE(di.description, p.name) AS descr,
      di.quantity AS qty
    FROM deal_items di
    LEFT JOIN products p ON p.id = di.product_id
    WHERE di.deal_id = _deal_id
  ),
  matched AS (
    SELECT
      a.art_nr,
      COALESCE(a.bezeich_1, i.descr) AS description,
      i.qty AS qty_needed,
      COALESCE((SELECT SUM(asl.bestand) FROM article_stock_locations asl WHERE asl.art_nr = a.art_nr), 0) AS on_hand
    FROM items i
    JOIN articles a ON a.art_nr = i.art_nr_guess
  )
  SELECT
    m.art_nr,
    m.description,
    m.qty_needed,
    m.on_hand,
    GREATEST(m.qty_needed - m.on_hand, 0) AS qty_to_order,
    sr.lief_nr,
    sr.name_1 AS supplier_name,
    sr.lb_preis AS unit_price,
    sr.lieferzeit
  FROM matched m
  LEFT JOIN LATERAL (
    SELECT * FROM article_supplier_refs
    WHERE art_nr = m.art_nr
    ORDER BY folge NULLS LAST
    LIMIT 1
  ) sr ON true
  WHERE GREATEST(m.qty_needed - m.on_hand, 0) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_po_from_deal(uuid) TO authenticated;

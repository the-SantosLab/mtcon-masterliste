-- 1) parent_id für hierarchische Kategorien
ALTER TABLE public.insurance_categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.insurance_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ins_cat_parent ON public.insurance_categories(parent_id);

-- 2) UNIQUE(name) entfernen, eindeutig nur pro Eltern-Knoten
ALTER TABLE public.insurance_categories DROP CONSTRAINT IF EXISTS insurance_categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ins_cat_name_parent
  ON public.insurance_categories (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- 3) "Versicherungen"-Oberkategorie anlegen und bestehende Kategorien einordnen
DO $$
DECLARE v_parent uuid;
BEGIN
  SELECT id INTO v_parent FROM public.insurance_categories
    WHERE parent_id IS NULL AND lower(name) = 'versicherungen' LIMIT 1;

  IF v_parent IS NULL THEN
    INSERT INTO public.insurance_categories (name, description, color, icon, sort_order, parent_id)
    VALUES ('Versicherungen', 'Alle Versicherungsverträge', 'sky', 'shield-check', 10, NULL)
    RETURNING id INTO v_parent;
  END IF;

  UPDATE public.insurance_categories
    SET parent_id = v_parent
    WHERE parent_id IS NULL
      AND id <> v_parent
      AND lower(name) IN ('haftpflicht','sachversicherung','cyber','kfz','personen','sonstige');
END $$;
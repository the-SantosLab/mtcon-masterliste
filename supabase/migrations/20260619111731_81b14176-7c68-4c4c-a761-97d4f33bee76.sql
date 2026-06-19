
-- Surface manual insurance document uploads in the central Inbox so they appear
-- as "Eingang" for admins (e.g. Mario sees what Meik uploaded).

CREATE OR REPLACE FUNCTION public.surface_insurance_doc_in_inbox()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uploader_name text;
BEGIN
  SELECT display_name INTO v_uploader_name FROM public.users_profile WHERE id = NEW.uploaded_by;

  INSERT INTO public.inbox_documents (
    received_at, subject, filename, storage_path,
    extracted_data, status, linked_table, linked_id,
    created_by, from_name
  ) VALUES (
    COALESCE(NEW.uploaded_at, now()),
    'Versicherung: ' || COALESCE(NEW.file_name, 'Dokument'),
    NEW.file_name,
    NEW.storage_path,
    '{}'::jsonb,
    'confirmed',
    'insurance_documents',
    NEW.id,
    NEW.uploaded_by,
    COALESCE(v_uploader_name, 'Manueller Upload')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_surface_insurance_doc_in_inbox ON public.insurance_documents;
CREATE TRIGGER trg_surface_insurance_doc_in_inbox
AFTER INSERT ON public.insurance_documents
FOR EACH ROW EXECUTE FUNCTION public.surface_insurance_doc_in_inbox();

-- Backfill: existing insurance documents that are not yet in the inbox
INSERT INTO public.inbox_documents (
  received_at, subject, filename, storage_path,
  extracted_data, status, linked_table, linked_id,
  created_by, from_name
)
SELECT
  COALESCE(d.uploaded_at, now()),
  'Versicherung: ' || COALESCE(d.file_name, 'Dokument'),
  d.file_name,
  d.storage_path,
  '{}'::jsonb,
  'confirmed',
  'insurance_documents',
  d.id,
  d.uploaded_by,
  COALESCE(up.display_name, 'Manueller Upload')
FROM public.insurance_documents d
LEFT JOIN public.users_profile up ON up.id = d.uploaded_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.inbox_documents i
  WHERE i.linked_table = 'insurance_documents' AND i.linked_id = d.id
);

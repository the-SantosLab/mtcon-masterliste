UPDATE storage.objects
SET name = replace(name, 'internal/88bdab06-8d37-4a0b-8754-30f8d3b3772a/', 'tickets/88bdab06-8d37-4a0b-8754-30f8d3b3772a/')
WHERE bucket_id = 'support-attachments'
  AND name LIKE 'internal/88bdab06-8d37-4a0b-8754-30f8d3b3772a/%';

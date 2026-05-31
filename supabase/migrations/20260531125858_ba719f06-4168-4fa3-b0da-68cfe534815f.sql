UPDATE storage.objects
SET name = replace(name, 'tickets/88bdab06-8d37-4a0b-8754-30f8d3b3772a/', 'internal/88bdab06-8d37-4a0b-8754-30f8d3b3772a/')
WHERE bucket_id = 'support-attachments'
  AND name LIKE 'tickets/88bdab06-8d37-4a0b-8754-30f8d3b3772a/%'
  AND name LIKE '%screenshot-1780231919018%';
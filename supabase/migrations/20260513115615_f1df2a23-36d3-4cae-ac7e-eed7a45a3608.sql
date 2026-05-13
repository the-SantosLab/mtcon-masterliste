ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS dashboard_status_filters text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dashboard_chart_range text NOT NULL DEFAULT 'week';

-- Add source tracking to body_metrics for Apple Health dedup
ALTER TABLE public.body_metrics ADD COLUMN source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.body_metrics ADD COLUMN source_id text;

-- Unique constraint on source_id to prevent duplicates from Apple Health
CREATE UNIQUE INDEX body_metrics_source_id_unique ON public.body_metrics (source_id) WHERE source_id IS NOT NULL;

-- Unique constraint on user_id + date + source to allow upsert (one entry per source per day)
CREATE UNIQUE INDEX body_metrics_user_date_source_unique ON public.body_metrics (user_id, date, source);

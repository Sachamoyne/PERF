ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'sleep_hours';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'sleep_score';

CREATE TABLE IF NOT EXISTS public.sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  bedtime time,
  wake_time time,
  duration_hours numeric(4,2),
  score smallint CHECK (score >= 0 AND score <= 99),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sleep logs" ON public.sleep_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

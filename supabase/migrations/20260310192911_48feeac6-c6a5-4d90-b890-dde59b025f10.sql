
-- Body metrics table
CREATE TABLE public.body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  weight_kg double precision,
  body_fat_pc double precision,
  muscle_mass_kg double precision,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.body_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own body metrics" ON public.body_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own body metrics" ON public.body_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own body metrics" ON public.body_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own body metrics" ON public.body_metrics FOR DELETE USING (auth.uid() = user_id);

-- Exercise stats table
CREATE TABLE public.exercise_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exercise_name text NOT NULL,
  weight_kg double precision NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 10,
  sets integer NOT NULL DEFAULT 3,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exercise stats" ON public.exercise_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise stats" ON public.exercise_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercise stats" ON public.exercise_stats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercise stats" ON public.exercise_stats FOR DELETE USING (auth.uid() = user_id);

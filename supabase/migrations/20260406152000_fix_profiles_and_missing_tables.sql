-- Hotfix migration for production environments where local migrations were not fully applied.
-- Safe to re-run.
-- NOTE:
-- metric_type enum values are managed in a dedicated migration
-- (20260406151000_add_metric_type_values.sql) to avoid enum visibility
-- issues when replayed in a single transaction.

-- Ensure profiles has onboarding/profile fields expected by the frontend.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activity_level text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Ensure optional phase columns exist for phase persistence.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_phase text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phase_started_at timestamptz;

-- Backfill profiles from legacy user_profile table when present.
DO $$
BEGIN
  IF to_regclass('public.user_profile') IS NOT NULL THEN
    UPDATE public.profiles p
    SET
      sex = COALESCE(p.sex, up.sex),
      age = COALESCE(p.age, up.age),
      height_cm = COALESCE(p.height_cm, up.height_cm),
      weight_kg = COALESCE(p.weight_kg, up.weight_kg),
      activity_level = COALESCE(p.activity_level, up.activity_level),
      onboarding_completed = (
        p.onboarding_completed
        OR up.sex IS NOT NULL
        OR up.age IS NOT NULL
        OR up.height_cm IS NOT NULL
        OR up.activity_level IS NOT NULL
      )
    FROM public.user_profile up
    WHERE up.user_id = p.user_id;
  END IF;
END
$$;

-- Ensure legacy workout progression table exists if app still reads/writes it.
CREATE TABLE IF NOT EXISTS public.exercise_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name text NOT NULL,
  weight_kg double precision NOT NULL DEFAULT 0,
  reps integer NOT NULL DEFAULT 10,
  sets integer NOT NULL DEFAULT 3,
  session_id uuid REFERENCES public.activities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_stats' AND policyname = 'Users can view own exercise stats'
  ) THEN
    CREATE POLICY "Users can view own exercise stats" ON public.exercise_stats
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_stats' AND policyname = 'Users can insert own exercise stats'
  ) THEN
    CREATE POLICY "Users can insert own exercise stats" ON public.exercise_stats
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_stats' AND policyname = 'Users can update own exercise stats'
  ) THEN
    CREATE POLICY "Users can update own exercise stats" ON public.exercise_stats
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'exercise_stats' AND policyname = 'Users can delete own exercise stats'
  ) THEN
    CREATE POLICY "Users can delete own exercise stats" ON public.exercise_stats
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Ensure nutrition logs table exists for dashboard aggregation jobs.
CREATE TABLE IF NOT EXISTS public.nutrition_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  meal_type text,
  calories_kcal numeric(10,2) NOT NULL DEFAULT 0,
  protein_g numeric(10,2) NOT NULL DEFAULT 0,
  carbs_g numeric(10,2) NOT NULL DEFAULT 0,
  fat_g numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_logs_user_date_idx
  ON public.nutrition_logs (user_id, date DESC);

ALTER TABLE public.nutrition_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nutrition_logs' AND policyname = 'Users can manage own nutrition logs'
  ) THEN
    CREATE POLICY "Users can manage own nutrition logs"
      ON public.nutrition_logs
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- Recreate data-deletion RPC to tolerate optional/legacy tables.
CREATE OR REPLACE FUNCTION public.clear_user_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF to_regclass('public.workout_sets') IS NOT NULL THEN
    DELETE FROM public.workout_sets WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.workout_sessions') IS NOT NULL THEN
    DELETE FROM public.workout_sessions WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.exercise_stats') IS NOT NULL THEN
    DELETE FROM public.exercise_stats WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.sleep_logs') IS NOT NULL THEN
    DELETE FROM public.sleep_logs WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.nutrition_logs') IS NOT NULL THEN
    DELETE FROM public.nutrition_logs WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    DELETE FROM public.journal_entries WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.body_metrics') IS NOT NULL THEN
    DELETE FROM public.body_metrics WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.activities') IS NOT NULL THEN
    DELETE FROM public.activities WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.health_metrics') IS NOT NULL THEN
    DELETE FROM public.health_metrics WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.sync_logs') IS NOT NULL THEN
    DELETE FROM public.sync_logs WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.user_profile') IS NOT NULL THEN
    DELETE FROM public.user_profile WHERE user_id = _user_id;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    DELETE FROM public.profiles WHERE user_id = _user_id;
  END IF;

  result := json_build_object(
    'success', true,
    'message', 'All user data cleared'
  );
  RETURN result;
END;
$$;

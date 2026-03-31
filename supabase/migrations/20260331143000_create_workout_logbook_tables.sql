CREATE TABLE IF NOT EXISTS public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  set_number INTEGER NOT NULL CHECK (set_number > 0),
  reps INTEGER NOT NULL CHECK (reps > 0),
  weight_kg NUMERIC NOT NULL CHECK (weight_kg >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_user_activity_unique
  ON public.workout_sessions (user_id, activity_id)
  WHERE activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS workout_sessions_user_date_idx
  ON public.workout_sessions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS workout_sets_session_id_idx
  ON public.workout_sets (session_id);

CREATE INDEX IF NOT EXISTS workout_sets_user_id_idx
  ON public.workout_sets (user_id);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sessions' AND policyname = 'Users can view own workout sessions'
  ) THEN
    CREATE POLICY "Users can view own workout sessions"
      ON public.workout_sessions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sessions' AND policyname = 'Users can insert own workout sessions'
  ) THEN
    CREATE POLICY "Users can insert own workout sessions"
      ON public.workout_sessions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sessions' AND policyname = 'Users can update own workout sessions'
  ) THEN
    CREATE POLICY "Users can update own workout sessions"
      ON public.workout_sessions FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sessions' AND policyname = 'Users can delete own workout sessions'
  ) THEN
    CREATE POLICY "Users can delete own workout sessions"
      ON public.workout_sessions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sets' AND policyname = 'Users can view own workout sets'
  ) THEN
    CREATE POLICY "Users can view own workout sets"
      ON public.workout_sets FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sets' AND policyname = 'Users can insert own workout sets'
  ) THEN
    CREATE POLICY "Users can insert own workout sets"
      ON public.workout_sets FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sets' AND policyname = 'Users can update own workout sets'
  ) THEN
    CREATE POLICY "Users can update own workout sets"
      ON public.workout_sets FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'workout_sets' AND policyname = 'Users can delete own workout sets'
  ) THEN
    CREATE POLICY "Users can delete own workout sets"
      ON public.workout_sets FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

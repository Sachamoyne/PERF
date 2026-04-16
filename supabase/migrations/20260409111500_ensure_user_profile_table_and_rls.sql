-- Safety migration for production parity: ensure legacy public.user_profile exists
-- and is writable/readable by the authenticated owner only.

CREATE TABLE IF NOT EXISTS public.user_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  gender text CHECK (gender IN ('male', 'female')),
  age integer CHECK (age > 0 AND age < 120),
  height_cm double precision CHECK (height_cm > 0),
  activity_level text CHECK (
    activity_level IN ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')
  ) DEFAULT 'very_active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS sex text;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS height_cm double precision;
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS activity_level text DEFAULT 'very_active';
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_profile ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_gender_check'
      AND conrelid = 'public.user_profile'::regclass
  ) THEN
    ALTER TABLE public.user_profile
      ADD CONSTRAINT user_profile_gender_check
      CHECK (gender IN ('male', 'female'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_sex_check'
      AND conrelid = 'public.user_profile'::regclass
  ) THEN
    ALTER TABLE public.user_profile
      ADD CONSTRAINT user_profile_sex_check
      CHECK (sex IN ('male', 'female'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_age_check'
      AND conrelid = 'public.user_profile'::regclass
  ) THEN
    ALTER TABLE public.user_profile
      ADD CONSTRAINT user_profile_age_check
      CHECK (age > 0 AND age < 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_height_cm_check'
      AND conrelid = 'public.user_profile'::regclass
  ) THEN
    ALTER TABLE public.user_profile
      ADD CONSTRAINT user_profile_height_cm_check
      CHECK (height_cm > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profile_activity_level_check'
      AND conrelid = 'public.user_profile'::regclass
  ) THEN
    ALTER TABLE public.user_profile
      ADD CONSTRAINT user_profile_activity_level_check
      CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'very_active', 'extra_active'));
  END IF;
END
$$;

UPDATE public.user_profile
SET gender = COALESCE(gender, sex)
WHERE gender IS NULL AND sex IS NOT NULL;

UPDATE public.user_profile
SET sex = COALESCE(sex, gender)
WHERE sex IS NULL AND gender IS NOT NULL;

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'Users can view own user profile'
  ) THEN
    CREATE POLICY "Users can view own user profile"
      ON public.user_profile
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'Users can insert own user profile'
  ) THEN
    CREATE POLICY "Users can insert own user profile"
      ON public.user_profile
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'Users can update own user profile'
  ) THEN
    CREATE POLICY "Users can update own user profile"
      ON public.user_profile
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_profile' AND policyname = 'Users can delete own user profile'
  ) THEN
    CREATE POLICY "Users can delete own user profile"
      ON public.user_profile
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profile TO authenticated;
GRANT ALL ON public.user_profile TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_user_profile_updated_at'
      AND tgrelid = 'public.user_profile'::regclass
  ) THEN
    CREATE TRIGGER update_user_profile_updated_at
    BEFORE UPDATE ON public.user_profile
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

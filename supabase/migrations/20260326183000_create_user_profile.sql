CREATE TABLE IF NOT EXISTS public.user_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  sex text CHECK (sex IN ('male', 'female')),
  age integer CHECK (age > 0 AND age < 120),
  height_cm double precision CHECK (height_cm > 0),
  weight_kg double precision CHECK (weight_kg > 0),
  activity_level text CHECK (
    activity_level IN ('sedentary', 'light', 'moderate', 'very_active', 'extra_active')
  ) DEFAULT 'very_active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user profile"
ON public.user_profile
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user profile"
ON public.user_profile
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user profile"
ON public.user_profile
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own user profile"
ON public.user_profile
FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_profile_updated_at
BEFORE UPDATE ON public.user_profile
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Keep metric enum aligned with app code.
-- Isolated in its own migration so enum additions commit independently.
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'steps';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'calories_total';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'protein';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'carbs';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'fat';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'calorie_balance';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'sleep_hours';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'weight';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'body_fat';

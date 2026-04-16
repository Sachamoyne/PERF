-- Persist calorie balance components computed on iPhone so every device
-- (including Mac) can render exactly the same numbers.
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'calorie_smr';
ALTER TYPE public.metric_type ADD VALUE IF NOT EXISTS 'calorie_sport';


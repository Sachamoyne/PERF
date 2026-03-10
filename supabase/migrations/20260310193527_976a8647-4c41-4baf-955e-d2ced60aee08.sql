
-- Add session_id to exercise_stats to link exercises to workout sessions
ALTER TABLE public.exercise_stats ADD COLUMN session_id uuid REFERENCES public.activities(id) ON DELETE SET NULL;

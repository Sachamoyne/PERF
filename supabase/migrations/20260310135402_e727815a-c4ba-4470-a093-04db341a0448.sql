
-- Add match-specific fields to activities table for racket sports
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS session_type text DEFAULT 'training',
  ADD COLUMN IF NOT EXISTS opponent_name text,
  ADD COLUMN IF NOT EXISTS match_score text,
  ADD COLUMN IF NOT EXISTS match_result text;

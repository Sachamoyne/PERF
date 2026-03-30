ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS mood_tags text[];

ALTER TABLE public.journal_entries
DROP CONSTRAINT IF EXISTS journal_entries_mood_tags_max_three;

ALTER TABLE public.journal_entries
ADD CONSTRAINT journal_entries_mood_tags_max_three
CHECK (mood_tags IS NULL OR cardinality(mood_tags) <= 3);

-- Harden activities consistency:
-- 1) remove exact duplicate rows (keep earliest created row)
-- 2) enforce a no-duplicate unique signature for future inserts
-- Safe to re-run.

-- Useful index for all sport dashboards by user/date.
CREATE INDEX IF NOT EXISTS activities_user_start_time_idx
  ON public.activities (user_id, start_time DESC);

-- Remove exact duplicates already present.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        user_id,
        start_time,
        sport_type,
        duration_sec,
        COALESCE(distance_meters, -1::double precision),
        COALESCE(calories, -1),
        COALESCE(total_elevation_gain, -1::double precision)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.activities
)
DELETE FROM public.activities a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- Enforce no exact duplicate activity payload for a user.
CREATE UNIQUE INDEX IF NOT EXISTS activities_user_signature_unique_idx
  ON public.activities (
    user_id,
    start_time,
    sport_type,
    duration_sec,
    COALESCE(distance_meters, -1::double precision),
    COALESCE(calories, -1),
    COALESCE(total_elevation_gain, -1::double precision)
  );


-- Function to clear all user data without deleting the account
CREATE OR REPLACE FUNCTION public.clear_user_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  -- Verify the caller is the owner
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.exercise_stats WHERE user_id = _user_id;
  DELETE FROM public.body_metrics WHERE user_id = _user_id;
  DELETE FROM public.activities WHERE user_id = _user_id;
  DELETE FROM public.health_metrics WHERE user_id = _user_id;
  DELETE FROM public.sync_logs WHERE user_id = _user_id;

  -- Reset profile sync timestamp
  UPDATE public.profiles SET last_sync = NULL WHERE user_id = _user_id;

  result := json_build_object(
    'success', true,
    'message', 'All user data cleared'
  );
  RETURN result;
END;
$$;

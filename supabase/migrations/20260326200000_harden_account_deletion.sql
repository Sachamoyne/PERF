-- Recreate functions with new signatures (safe for reruns/manual apply).
DROP FUNCTION IF EXISTS public.delete_user_account(uuid);
DROP FUNCTION IF EXISTS public.clear_user_data(uuid);

-- Extend clear_user_data to purge all user-linked data tables.
CREATE OR REPLACE FUNCTION public.clear_user_data(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.exercise_stats WHERE user_id = _user_id;
  DELETE FROM public.sleep_logs WHERE user_id = _user_id;
  DELETE FROM public.journal_entries WHERE user_id = _user_id;
  DELETE FROM public.body_metrics WHERE user_id = _user_id;
  DELETE FROM public.activities WHERE user_id = _user_id;
  DELETE FROM public.health_metrics WHERE user_id = _user_id;
  DELETE FROM public.sync_logs WHERE user_id = _user_id;
  DELETE FROM public.user_profile WHERE user_id = _user_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;

  result := json_build_object(
    'success', true,
    'message', 'All user data cleared'
  );
  RETURN result;
END;
$$;

-- Full account deletion RPC.
-- Security model:
-- - caller must pass their own user id (auth.uid() check)
-- - function runs as definer to delete from auth.users
CREATE OR REPLACE FUNCTION public.delete_user_account(_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  PERFORM public.clear_user_data(_user_id);
  DELETE FROM auth.users WHERE id = _user_id;

  result := json_build_object(
    'success', true,
    'message', 'Account deleted'
  );
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account(uuid) TO authenticated;

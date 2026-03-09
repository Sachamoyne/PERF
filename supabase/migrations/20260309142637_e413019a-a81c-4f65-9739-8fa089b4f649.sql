
-- Add last_sync to profiles
ALTER TABLE public.profiles ADD COLUMN last_sync TIMESTAMPTZ;

-- Create sync_logs table
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
  records_imported INT NOT NULL DEFAULT 0,
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync logs" ON public.sync_logs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync logs" ON public.sync_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow service role insert (for edge function)
CREATE POLICY "Service role can insert sync logs" ON public.sync_logs
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can select sync logs" ON public.sync_logs
  FOR SELECT TO service_role USING (true);

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

type SleepLogRow = Tables<"sleep_logs">;

export function useSleepLogs(days = 30) {
  return useQuery({
    queryKey: ["sleep_logs", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return (data ?? []) as SleepLogRow[];
    },
  });
}

export function useLatestSleepLog() {
  return useQuery({
    queryKey: ["latest_sleep"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as SleepLogRow | null;
    },
  });
}

interface SleepLogUpsertInput {
  date: string;
  bedtime?: string | null;
  wake_time?: string | null;
  duration_hours?: number | null;
  score?: number | null;
  notes?: string | null;
}

interface SleepLogUpdateInput {
  id: string;
  bedtime?: string | null;
  wake_time?: string | null;
  duration_hours?: number | null;
  score?: number | null;
  notes?: string | null;
}

export function useInsertSleepLog() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (values: SleepLogUpsertInput) => {
      if (!user) throw new Error("Not authenticated");

      const payload = {
        user_id: user.id,
        date: values.date,
        bedtime: values.bedtime ?? null,
        wake_time: values.wake_time ?? null,
        duration_hours: values.duration_hours ?? null,
        score: values.score ?? null,
        notes: values.notes ?? null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("sleep_logs")
        .upsert(payload, { onConflict: "user_id,date" });

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep_logs"] });
      qc.invalidateQueries({ queryKey: ["latest_sleep"] });
    },
  });
}

export function useUpdateSleepLog() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ id, ...values }: SleepLogUpdateInput) => {
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("sleep_logs")
        .update({
          bedtime: values.bedtime,
          wake_time: values.wake_time,
          duration_hours: values.duration_hours,
          score: values.score,
          notes: values.notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sleep_logs"] });
      qc.invalidateQueries({ queryKey: ["latest_sleep"] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface BodyMetricRow {
  id: string;
  user_id: string;
  date: string;
  weight_kg: number | null;
  body_fat_pc: number | null;
  muscle_mass_kg: number | null;
  created_at: string;
}

export function useBodyMetrics(days = 30) {
  return useQuery({
    queryKey: ["body_metrics", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("body_metrics")
        .select("*")
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BodyMetricRow[];
    },
  });
}

export function useLatestBodyMetric() {
  return useQuery({
    queryKey: ["body_metrics_latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_metrics")
        .select("*")
        .order("date", { ascending: false })
        .limit(2);
      if (error) throw error;
      return (data ?? []) as BodyMetricRow[];
    },
  });
}

export function useInsertBodyMetric() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { weight_kg?: number; body_fat_pc?: number; muscle_mass_kg?: number }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("body_metrics").insert({
        user_id: user.id,
        ...values,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["body_metrics"] });
      qc.invalidateQueries({ queryKey: ["body_metrics_latest"] });
    },
  });
}

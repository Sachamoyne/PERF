import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useHealthMetrics(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["health_metrics", days, user?.id],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      if (!user) return [];
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("health_metrics")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", sinceStr)
        .order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useLatestMetrics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["latest_metrics", user?.id],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      if (!user) return {};
      const types = ["hrv", "sleep_score", "rhr", "vo2max"] as const;
      const results: Record<string, { value: number; unit: string; trend: number[] }> = {};

      for (const type of types) {
        const { data } = await supabase
          .from("health_metrics")
          .select("value, date, unit")
          .eq("user_id", user.id)
          .eq("metric_type", type)
          .order("date", { ascending: false })
          .limit(7);

        if (data && data.length > 0) {
          results[type] = {
            value: data[0].value,
            unit: data[0].unit,
            trend: data.map((d) => d.value).reverse(),
          };
        }
      }
      return results;
    },
  });
}

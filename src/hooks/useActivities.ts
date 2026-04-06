import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";

type SportType = Database["public"]["Enums"]["sport_type"];

export function useActivities(sportType?: SportType | SportType[], limit?: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activities", user?.id, sportType, limit],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
        .order("start_time", { ascending: false });

      if (sportType) {
        if (Array.isArray(sportType)) {
          query = query.in("sport_type", sportType);
        } else {
          query = query.eq("sport_type", sportType);
        }
      }
      if (limit) query = query.limit(limit);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useActivityHeatmap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activity_heatmap", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return {};
      const since = new Date();
      since.setDate(since.getDate() - 365);
      const { data, error } = await supabase
        .from("activities")
        .select("start_time")
        .eq("user_id", user.id)
        .gte("start_time", since.toISOString());
      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((a) => {
        const day = a.start_time.split("T")[0];
        counts[day] = (counts[day] || 0) + 1;
      });
      return counts;
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

type SportType = Database["public"]["Enums"]["sport_type"];
type MetricType = Database["public"]["Enums"]["metric_type"];

export interface HealthMetricRow {
  id: string;
  user_id: string;
  date: string;
  metric_type: MetricType;
  value: number;
  unit: string;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  user_id: string;
  sport_type: SportType;
  start_time: string;
  duration_sec: number;
  calories: number | null;
  avg_hr: number | null;
  distance_meters: number | null;
  total_elevation_gain: number | null;
  created_at: string;
}

export interface LatestMetric {
  value: number;
  unit: string;
  trend: number[];
}

export interface HrvTrend {
  avg7: number;
  avg30: number;
  improving: boolean;
}

export interface WeeklySportSummary {
  sport: SportType;
  label: string;
  totalMinutes: number;
  sessions: number;
}

// --- Source abstraction (ready for Apple Health later) ---
type DataSource = "supabase"; // | "apple_health" in the future

const DATA_SOURCE: DataSource = "supabase";

// Core data fetchers
async function fetchMetrics(days: number, userId: string): Promise<HealthMetricRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("health_metrics")
    .select("*")
    .eq("user_id", userId)
    .gte("date", sinceStr)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchActivities(
  userId: string,
  sportType?: SportType | SportType[],
  limit?: number
): Promise<ActivityRow[]> {
  let query = supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
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
  return data ?? [];
}

// --- Hooks ---

export function useHealthMetrics(days = 30) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["health_metrics", days, user?.id],
    enabled: !!user,
    staleTime: 0,
    queryFn: () => fetchMetrics(days, user!.id),
  });
}

export function useActivities(sportType?: SportType | SportType[], limit?: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activities", user?.id, sportType, limit],
    enabled: !!user,
    staleTime: 0,
    queryFn: () => fetchActivities(user!.id, sportType, limit),
  });
}

export function useActivityHeatmap() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["activity_heatmap", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return {} as Record<string, number>;
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

export function useLatestMetrics() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["latest_metrics", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return {} as Record<string, LatestMetric>;
      const types = ["hrv", "sleep_score", "rhr", "vo2max"] as const;
      const results: Record<string, LatestMetric> = {};
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

export function useHrvTrend(): { data: HrvTrend | null; isLoading: boolean } {
  const { data: metrics, isLoading } = useHealthMetrics(30);

  if (isLoading || !metrics) return { data: null, isLoading };

  const hrvMetrics = metrics
    .filter((m) => m.metric_type === "hrv")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (hrvMetrics.length < 7) return { data: null, isLoading: false };

  const last7 = hrvMetrics.slice(-7);
  const avg7 = last7.reduce((s, m) => s + m.value, 0) / last7.length;
  const avg30 = hrvMetrics.reduce((s, m) => s + m.value, 0) / hrvMetrics.length;

  return {
    data: {
      avg7: Math.round(avg7 * 10) / 10,
      avg30: Math.round(avg30 * 10) / 10,
      improving: avg7 > avg30,
    },
    isLoading: false,
  };
}

const sportLabels: Record<SportType, string> = {
  running: "Course",
  cycling: "Vélo",
  swimming: "Natation",
  tennis: "Tennis",
  padel: "Padel",
  strength: "Musculation",
};

export function useWeeklySportSummary(): { data: WeeklySportSummary[]; isLoading: boolean } {
  const { user } = useAuth();
  // Semaine ISO: lundi 00:00 → dimanche 23:59 (timezone locale)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  // 0=Dimanche, 1=Lundi... → on veut lundi
  const day = weekStart.getDay(); // 0..6
  const diffToMonday = (day + 6) % 7; // lundi => 0, dimanche => 6
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setMilliseconds(-1); // dimanche 23:59:59.999

  const { data: activities, isLoading } = useQuery({
    queryKey: ["weekly_summary", user?.id, weekStart.toISOString().slice(0, 10)],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { sport_type: SportType; duration_sec: number }[];
      const { data, error } = await supabase
        .from("activities")
        .select("sport_type, duration_sec")
        .eq("user_id", user.id)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", weekEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || !activities) return { data: [], isLoading };

  const bySport: Record<string, { totalMinutes: number; sessions: number }> = {};
  for (const a of activities) {
    if (!bySport[a.sport_type]) bySport[a.sport_type] = { totalMinutes: 0, sessions: 0 };
    bySport[a.sport_type].totalMinutes += a.duration_sec / 60;
    bySport[a.sport_type].sessions++;
  }

  return {
    data: Object.entries(bySport)
      .map(([sport, data]) => ({
        sport: sport as SportType,
        label: sportLabels[sport as SportType] || sport,
        totalMinutes: Math.round(data.totalMinutes),
        sessions: data.sessions,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes),
    isLoading: false,
  };
}

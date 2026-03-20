import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type MetricType = Database["public"]["Enums"]["metric_type"];

const PERIODS = [
  { label: "7j", days: 7 },
  { label: "1m", days: 30 },
  { label: "3m", days: 90 },
  { label: "1a", days: 365 },
] as const;

interface KpiCardProps {
  metricType: string;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  date?: string;
  source?: "health_metrics" | "body_metrics";
  bodyField?: "weight_kg" | "body_fat_pc" | "muscle_mass_kg";
  /** If true, a decrease is shown green (good) */
  invertDelta?: boolean;
}

const HEALTH_METRIC_TYPES: MetricType[] = [
  "hrv",
  "sleep_score",
  "rhr",
  "body_battery",
  "vo2max",
  "steps",
  "calories_total",
  "protein",
  "calorie_balance",
  "sleep_hours",
];

function isHealthMetricType(metricType: string): metricType is MetricType {
  return (HEALTH_METRIC_TYPES as string[]).includes(metricType);
}

function useMetricHistory(metricType: string, days: number, enabled: boolean, date?: string) {
  return useQuery({
    queryKey: ["kpi_metric", metricType, days, date],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("health_metrics")
        .select("value, date, unit")
        .eq("metric_type", metricType as MetricType);

      if (date) {
        query = query.eq("date", date);
      } else {
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte("date", since.toISOString().split("T")[0]);
      }

      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useBodyMetricHistory(field: string, days: number, date?: string) {
  return useQuery({
    queryKey: ["kpi_body_metric", field, days, date],
    queryFn: async () => {
      let query = supabase
        .from("body_metrics")
        .select("date, weight_kg, body_fat_pc, muscle_mass_kg");

      if (date) {
        query = query.eq("date", date);
      } else {
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte("date", since.toISOString().split("T")[0]);
      }

      const { data, error } = await query.order("date", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((d: any) => ({ value: d[field] as number | null, date: d.date }))
        .filter((d) => d.value != null) as { value: number; date: string }[];
    },
  });
}

export function KpiCard({ metricType, label, color, icon, date, source = "health_metrics", bodyField, invertDelta }: KpiCardProps) {
  const [periodIdx, setPeriodIdx] = useState(0);
  const period = PERIODS[periodIdx];

  const enableHealthQuery = source === "health_metrics" && isHealthMetricType(metricType);
  const { data: healthHistory = [] } = useMetricHistory(metricType, period.days, enableHealthQuery, date);
  const { data: bodyHistory = [] } = useBodyMetricHistory(bodyField || "weight_kg", period.days, date);

  const history = source === "body_metrics" ? bodyHistory : healthHistory;

  const { displayValue, unit, delta, deltaLabel, chartData, gradientId } = useMemo(() => {
    const gId = `gradient-${metricType}`;
    if (history.length === 0) {
      return { displayValue: "—", unit: "", delta: null, deltaLabel: "", chartData: [], gradientId: gId };
    }

    const values = history.map((d) => d.value);
    const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
    const latest = history[history.length - 1];

    // Determine unit
    const u = source === "body_metrics"
      ? (bodyField === "body_fat_pc" ? "%" : "kg")
      : (latest as any).unit || "";

    const display = date ? latest.value : (period.days === 7 ? latest.value : avg);

    let d: number | null = null;
    let dLabel = "";
    if (history.length >= 2) {
      const current = history[history.length - 1].value;
      const previous = history[history.length - 2].value;
      d = Math.round((current - previous) * 10) / 10;
      dLabel = d > 0 ? `+${d}` : `${d}`;
    }

    return {
      displayValue: typeof display === "number" ? Math.round(display * 10) / 10 : display,
      unit: u,
      delta: d,
      deltaLabel: dLabel,
      chartData: values.map((v, i) => ({ v, i })),
      gradientId: gId,
    };
  }, [history, period.days, metricType, source, bodyField, date]);

  // Semantic color for delta: invertDelta means decrease = good (green)
  const deltaIsGood = delta !== null && delta !== 0
    ? (invertDelta ? delta < 0 : delta > 0)
    : null;

  return (
    <div className="glass-card p-3 flex flex-col justify-between overflow-hidden" style={{ minHeight: "140px" }}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        {delta !== null && delta !== 0 && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${deltaIsGood ? "text-primary" : "text-destructive"}`}>
            {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {deltaLabel}
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mt-1">
        <span className="text-xl font-display font-bold leading-none" style={{ color }}>
          {displayValue}
        </span>
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
        {!date && period.days > 7 && history.length > 0 && (
          <span className="text-[9px] text-muted-foreground ml-1">(moy.)</span>
        )}
      </div>

      {/* Sparkline area chart */}
      <div className="h-[36px] w-full mt-1 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Period selector */}
      <div className="flex gap-0.5 mt-1">
        {PERIODS.map((p, idx) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(idx)}
            className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium transition-colors ${
              idx === periodIdx
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

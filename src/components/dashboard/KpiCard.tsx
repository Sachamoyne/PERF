import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Area, AreaChart, Bar, BarChart,
  CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { Database } from "@/integrations/supabase/types";
import { usePersistedChartPeriod } from "@/hooks/usePersistedChartPeriod";
import { parseLocalDate } from "@/lib/utils";

type MetricType = Database["public"]["Enums"]["metric_type"];

const PERIODS = [
  { label: "7j",  days: 7   },
  { label: "1m",  days: 30  },
  { label: "3m",  days: 90  },
  { label: "1a",  days: 365 },
] as const;
const PERIODS_WITH_ALL = [
  ...PERIODS,
  { label: "Tout", days: null },
] as const;

// Métriques dont l'axe Y doit commencer à 0
const ZERO_BASED: string[] = ["steps", "calories_total", "protein", "calorie_balance", "sleep_hours"];

const HEALTH_METRIC_TYPES: MetricType[] = [
  "hrv","sleep_score","rhr","body_battery","vo2max",
  "steps","calories_total","protein","calorie_balance","sleep_hours",
];

function isHealthMetricType(m: string): m is MetricType {
  return (HEALTH_METRIC_TYPES as string[]).includes(m);
}

function toLocalDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function aggregateByMonth(
  data: { value: number; date: string }[],
  mode: "average" | "sum",
  labelVariant: "month_short" | "month_year" | "month_year_short" = "month_short"
): { label: string; v: number; date: string }[] {
  const byMonth: Record<string, number[]> = {};
  for (const e of data) {
    const key = e.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(e.value);
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => {
      const v = mode === "sum"
        ? vals.reduce((s, x) => s + x, 0)
        : Math.round((vals.reduce((s, x) => s + x, 0) / vals.length) * 10) / 10;
      const [y, m] = key.split("-");
      const date = new Date(Number(y), Number(m)-1, 1);
      const lbl = labelVariant === "month_year"
        ? date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })
        : labelVariant === "month_year_short"
          ? date.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
          : date.toLocaleDateString("fr-FR", { month: "short" });
      return { label: lbl, v, date: key + "-01" };
    });
}

interface KpiCardProps {
  metricType: string;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  source?: "health_metrics" | "body_metrics";
  bodyField?: "weight_kg" | "body_fat_pc" | "muscle_mass_kg";
  invertDelta?: boolean;
  aggMode?: "average" | "sum";
  forceRaw?: boolean;
  detailPath?: string;
}

function useMetricHistory(metricType: string, days: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["kpi_metric", metricType, days ?? "all"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let query = supabase
        .from("health_metrics")
        .select("value, date, unit")
        .eq("metric_type", metricType as MetricType)
        .order("date", { ascending: true });
      if (days != null) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,"0")}-${String(since.getDate()).padStart(2,"0")}`;
        query = query.gte("date", sinceStr);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useBodyMetricHistory(field: string, days: number | null) {
  return useQuery({
    queryKey: ["kpi_body_metric", field, days ?? "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      let query = supabase
        .from("body_metrics")
        .select("date, weight_kg, body_fat_pc, muscle_mass_kg")
        .order("date", { ascending: true });
      if (days != null) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const sinceStr = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,"0")}-${String(since.getDate()).padStart(2,"0")}`;
        query = query.gte("date", sinceStr);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? [])
        .map((d: any) => ({ value: d[field] as number | null, date: d.date }))
        .filter((d) => d.value != null) as { value: number; date: string }[];
    },
  });
}

export function KpiCard({
  metricType, label, unit, color, icon,
  source = "health_metrics", bodyField, invertDelta, aggMode = "average", forceRaw = false, detailPath,
}: KpiCardProps) {
  const navigate = useNavigate();
  const STEPS_GOAL = 10_000;
  const isSteps = metricType === "steps";
  const supportsAllPeriod =
    (source === "body_metrics" && (bodyField === "weight_kg" || bodyField === "body_fat_pc"));
  const periodOptions = supportsAllPeriod ? PERIODS_WITH_ALL : PERIODS;
  const chartPeriodKey = source === "body_metrics"
    ? (bodyField ?? metricType)
    : metricType;
  const [periodIdx, setPeriodIdx] = usePersistedChartPeriod(chartPeriodKey, periodOptions);
  const period = periodOptions[periodIdx];
  const shouldForceRaw = forceRaw || metricType === "weight";
  const isAllPeriod = period.days == null;
  const isMonthly = !isAllPeriod && period.days >= 90 && !shouldForceRaw;
  const zeroBased = ZERO_BASED.includes(metricType);

  const enableHealth = source === "health_metrics" && isHealthMetricType(metricType);
  const { data: healthHistory = [] } = useMetricHistory(metricType, period.days, enableHealth);
  const { data: bodyHistory = [] } = useBodyMetricHistory(bodyField || "weight_kg", period.days);
  const history = source === "body_metrics" ? bodyHistory : healthHistory;

  const { displayValue, unit: displayUnit, delta, deltaLabel, dailyData, monthlyData } = useMemo(() => {
    if (history.length === 0) {
      return { displayValue: "—", unit: "", delta: null, deltaLabel: "", dailyData: [], monthlyData: [] };
    }
    const latest = history[history.length - 1];
    const u = source === "body_metrics"
      ? (bodyField === "body_fat_pc" ? "%" : "kg")
      : (latest as any).unit || unit;

    let d: number | null = null;
    let dLabel = "";
    if (history.length >= 2) {
      const cur = history[history.length - 1].value;
      const prev = history[history.length - 2].value;
      d = Math.round((cur - prev) * 10) / 10;
      dLabel = d > 0 ? `+${d}` : `${d}`;
    }

    const daily = history.map((e, i) => ({
      v: e.value,
      i,
      date: e.date,
      label: history.length <= 14
        ? format(new Date(e.date + "T12:00:00"), "d MMM", { locale: fr })
        : format(new Date(e.date + "T12:00:00"), "d/MM", { locale: fr }),
    }));

    const monthly = aggregateByMonth(history, aggMode);

    return {
      displayValue: Math.round(latest.value * 10) / 10,
      unit: u,
      delta: d,
      deltaLabel: dLabel,
      dailyData: daily,
      monthlyData: monthly,
    };
  }, [history, source, bodyField, unit, aggMode]);

  const chartData = useMemo(() => {
    if (!isAllPeriod) return isMonthly ? monthlyData : dailyData;
    if (history.length === 0) return [];

    const firstDate = parseLocalDate(history[0].date);
    const lastDate = parseLocalDate(history[history.length - 1].date);
    const spanDays = Math.max(1, Math.round((lastDate.getTime() - firstDate.getTime()) / 86_400_000));

    if (spanDays < 90) {
      return history.map((e, i) => ({
        v: e.value,
        i,
        date: e.date,
        label: format(new Date(e.date + "T12:00:00"), "d MMM", { locale: fr }),
      }));
    }

    const monthLabelVariant = spanDays < 365 ? "month_year" : "month_year_short";
    return aggregateByMonth(history, aggMode, monthLabelVariant);
  }, [isAllPeriod, isMonthly, monthlyData, dailyData, history, aggMode]);
  const chartDataWithGoal = useMemo(() => {
    if (!isSteps) return chartData;
    return chartData.map((d) => ({
      ...d,
      aboveGoal: typeof d.v === "number" && d.v >= STEPS_GOAL ? d.v : null,
      belowGoal: typeof d.v === "number" && d.v < STEPS_GOAL ? d.v : null,
    }));
  }, [chartData, isSteps]);

  // Bornes Y adaptatives
  const { yMin, yMax, yWidth } = useMemo(() => {
    if (chartData.length === 0) return { yMin: 0, yMax: 10, yWidth: 40 };
    const vals = chartData.map((d) => d.v).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return { yMin: 0, yMax: 10, yWidth: 40 };
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const pad = Math.max((maxV - minV) * 0.15, 1);
    const lo = zeroBased ? 0 : Math.floor(minV - pad);
    const hi = Math.ceil((isSteps ? Math.max(maxV, STEPS_GOAL) : maxV) + pad);
    // Largeur axe Y selon le nombre de chiffres
    const maxDigits = String(Math.round(hi)).length;
    const w = Math.max(28, maxDigits * 7 + 8);
    return { yMin: lo, yMax: hi, yWidth: w };
  }, [chartData, zeroBased, isSteps]);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "11px",
    padding: "6px 10px",
  };

  const axisStyle = { fontSize: 9, fill: "hsl(var(--muted-foreground))" };
  const isGoalMetToday = isSteps && typeof displayValue === "number" ? displayValue >= STEPS_GOAL : false;
  const valueColor = isSteps
    ? (isGoalMetToday ? "hsl(152, 60%, 48%)" : "hsl(0, 84%, 60%)")
    : color;
  const pointDot = useMemo(() => {
    if (chartData.length > 80) return false;
    if (isAllPeriod) return { fill: color, r: chartData.length <= 24 ? 4 : 2, strokeWidth: 0 };
    return chartData.length <= 30 ? { fill: color, r: chartData.length <= 7 ? 3 : 2, strokeWidth: 0 } : false;
  }, [chartData.length, isAllPeriod, color]);
  const activePointDot = useMemo(() => ({ r: isAllPeriod ? 6 : 4, fill: color, strokeWidth: 0 }), [isAllPeriod, color]);

  return (
    <div className="glass-card p-3 flex flex-col gap-2" style={{ minHeight: "220px" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          <span className="shrink-0">{icon}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (detailPath) navigate(detailPath);
            }}
            className={`truncate transition-colors ${detailPath ? "cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            {label}
          </button>
        </div>
      </div>

      {/* Valeur */}
      <div>
        <span className="text-2xl font-display font-bold leading-none" style={{ color: valueColor }}>
          {displayValue}
        </span>
        <span className="text-[11px] text-muted-foreground ml-1">{displayUnit}</span>
      </div>

      {/* Graphique */}
      <div className="flex-1" style={{ minHeight: "110px" }}>
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
            Aucune donnée
          </div>
        ) : isMonthly ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: isSteps ? 30 : 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={0} />
              <YAxis
                domain={[yMin, yMax]}
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                width={yWidth}
              />
              {isSteps && (
                <ReferenceLine
                  y={STEPS_GOAL}
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [`${Math.round(v * 10) / 10} ${displayUnit}`, aggMode === "sum" ? "Total" : "Moyenne"]}
                cursor={{ fill: color, fillOpacity: 0.1 }}
              />
              <Bar dataKey="v" fill={color} radius={[4, 4, 0, 0]} maxBarSize={40} fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartDataWithGoal} margin={{ top: 4, right: isSteps ? 30 : 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${metricType}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={0} />
              <YAxis
                domain={[yMin, yMax]}
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                width={yWidth}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [`${Math.round(v * 10) / 10} ${displayUnit}`, label]}
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  return d ? format(new Date(d + "T12:00:00"), "d MMMM yyyy", { locale: fr }) : "";
                }}
                cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              {isSteps && (
                <>
                  <Area
                    type="monotone"
                    dataKey="aboveGoal"
                    baseValue={STEPS_GOAL}
                    stroke="none"
                    fill="rgba(34, 197, 94, 0.28)"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="belowGoal"
                    baseValue={STEPS_GOAL}
                    stroke="none"
                    fill="rgba(239, 68, 68, 0.15)"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2}
                fill={isSteps ? "transparent" : `url(#grad-${metricType})`}
                dot={pointDot}
                activeDot={activePointDot}
                connectNulls
                isAnimationActive={false}
              />
              {isSteps && (
                <ReferenceLine
                  y={STEPS_GOAL}
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  ifOverflow="extendDomain"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Sélecteur période */}
      <div className="flex gap-0.5">
        {periodOptions.map((p, idx) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(idx)}
            className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium transition-colors ${
              idx === periodIdx ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

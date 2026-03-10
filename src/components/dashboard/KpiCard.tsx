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
}

function useMetricHistory(metricType: string, days: number) {
  return useQuery({
    queryKey: ["kpi_metric", metricType, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("health_metrics")
        .select("value, date, unit")
        .eq("metric_type", metricType as MetricType)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function KpiCard({ metricType, label, color, icon }: KpiCardProps) {
  const [periodIdx, setPeriodIdx] = useState(0);
  const period = PERIODS[periodIdx];
  const { data: history = [] } = useMetricHistory(metricType, period.days);

  const { displayValue, unit, delta, deltaLabel, chartData, gradientId } = useMemo(() => {
    const gId = `gradient-${metricType}`;
    if (history.length === 0) {
      return { displayValue: "—", unit: "", delta: null, deltaLabel: "", chartData: [], gradientId: gId };
    }

    const values = history.map((d) => d.value);
    const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
    const latest = history[history.length - 1];
    const u = latest.unit;

    // For 7j show latest value, otherwise show average
    const display = period.days === 7 ? latest.value : avg;

    // Day-over-day delta
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
  }, [history, period.days, metricType]);

  return (
    <div className="glass-card p-3 flex flex-col justify-between overflow-hidden" style={{ minHeight: "140px" }}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        {delta !== null && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : delta < 0 ? <TrendingDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
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
        {period.days > 7 && (
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

import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { useHealthMetrics, useActivities } from "@/hooks/useHealthData";
import { useBodyMetrics } from "@/hooks/useBodyMetrics";
import { Button } from "@/components/ui/button";

const sportIcons: Record<string, string> = {
  running: "🏃",
  cycling: "🚴",
  swimming: "🏊",
  tennis: "🎾",
  padel: "🏓",
  strength: "🏋️",
};

type Period = 7 | 30 | 90 | 365;

export function HealthChart() {
  const [days, setDays] = useState<Period>(7);
  const { data: metrics = [] } = useHealthMetrics(days);
  const { data: activities = [] } = useActivities(undefined, 500);
  const { data: bodyMetrics = [] } = useBodyMetrics(days);

  const chartData = useMemo(() => {
    // Build activity day map
    const actDays: Record<string, string[]> = {};
    activities.forEach((a) => {
      const day = a.start_time.split("T")[0];
      if (!actDays[day]) actDays[day] = [];
      if (!actDays[day].includes(a.sport_type)) actDays[day].push(a.sport_type);
    });

    // Group health metrics by date
    const byDate: Record<string, Record<string, number | null>> = {};
    metrics.forEach((m) => {
      if (!byDate[m.date]) byDate[m.date] = {};
      byDate[m.date][m.metric_type] = m.value;
    });

    // Merge body metrics
    bodyMetrics.forEach((b) => {
      if (!byDate[b.date]) byDate[b.date] = {};
      if (b.weight_kg != null) byDate[b.date].weight = b.weight_kg;
      if (b.body_fat_pc != null) byDate[b.date].body_fat = b.body_fat_pc;
    });

    const allData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        dateLabel: days <= 30
          ? format(new Date(date), "dd/MM")
          : format(new Date(date), "dd/MM/yy"),
        hrv: vals.hrv ?? null,
        sleep_score: vals.sleep_score ?? null,
        weight: vals.weight ?? null,
        body_fat: vals.body_fat ?? null,
        sports: actDays[date] || [],
      }));

    // Compute 7-day moving average for HRV
    return allData.map((entry, idx) => {
      const window = allData.slice(Math.max(0, idx - 6), idx + 1);
      const hrvValues = window.map((w) => w.hrv).filter((v): v is number => v !== null);
      const hrvMA = hrvValues.length > 0
        ? Math.round((hrvValues.reduce((s, v) => s + v, 0) / hrvValues.length) * 10) / 10
        : null;
      return { ...entry, hrv_ma: hrvMA };
    });
  }, [metrics, days, activities, bodyMetrics]);

  const periods: { label: string; value: Period }[] = [
    { label: "7j", value: 7 },
    { label: "1m", value: 30 },
    { label: "3m", value: 90 },
    { label: "1a", value: 365 },
  ];

  // Show fewer ticks on longer periods
  // Dynamically compute tick interval based on actual data length
  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (len <= 10) return 0;
    if (len <= 35) return 4; // ~every 5 days for 1m
    if (len <= 100) return 13; // ~every 2 weeks for 3m
    return Math.floor(len / 12); // ~12 ticks for 1a
  }, [chartData.length]);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-semibold text-foreground">HRV (moy.), Sommeil, Poids & Masse Grasse</h3>
        <div className="flex gap-1">
          {periods.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={days === p.value ? "default" : "ghost"}
              onClick={() => setDays(p.value)}
              className="text-xs h-7 px-3"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="dateLabel"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              interval={tickInterval}
              tick={({ x, y, payload }: any) => {
                const entry = chartData.find((d) => d.dateLabel === payload.value);
                const icons = days <= 30
                  ? entry?.sports?.map((s) => sportIcons[s] || "⚡").join("") || ""
                  : "";
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={14} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={11}>
                      {payload.value}
                    </text>
                    {icons && (
                      <text x={0} y={0} dy={28} textAnchor="middle" fontSize={10}>
                        {icons}
                      </text>
                    )}
                  </g>
                );
              }}
              height={days <= 30 ? 45 : 30}
            />
            <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="hrv_ma" name="HRV (moy. 7j)" stroke="hsl(var(--hrv))" strokeWidth={2} dot={false} />
            <Line yAxisId="left" type="monotone" dataKey="sleep_score" name="Sommeil (h)" stroke="hsl(var(--sleep))" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="weight" name="Poids (kg)" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="body_fat" name="Masse Grasse (%)" stroke="hsl(var(--running))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

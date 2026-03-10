import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { format } from "date-fns";
import { useHealthMetrics } from "@/hooks/useHealthData";
import { Button } from "@/components/ui/button";

export function HealthChart() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data: metrics = [] } = useHealthMetrics(30); // always fetch 30 to compute MA

  const { chartData } = useMemo(() => {
    // Group by date
    const byDate: Record<string, Record<string, number>> = {};
    metrics.forEach((m) => {
      if (!byDate[m.date]) byDate[m.date] = {};
      byDate[m.date][m.metric_type] = m.value;
    });

    const allData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date,
        dateLabel: format(new Date(date), "dd/MM"),
        hrv: vals.hrv ?? null,
        sleep_score: vals.sleep_score ?? null,
        rhr: vals.rhr ?? null,
      }));

    // Compute 7-day moving average for HRV
    const withMA = allData.map((entry, idx) => {
      const window = allData.slice(Math.max(0, idx - 6), idx + 1);
      const hrvValues = window.map((w) => w.hrv).filter((v): v is number => v !== null);
      const hrvMA = hrvValues.length > 0 ? Math.round((hrvValues.reduce((s, v) => s + v, 0) / hrvValues.length) * 10) / 10 : null;
      return { ...entry, hrv_ma: hrvMA };
    });

    // Slice to selected period
    const sliced = days === 7 ? withMA.slice(-7) : withMA;

    return { chartData: sliced };
  }, [metrics, days]);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-semibold text-foreground">HRV, Sommeil & FC Repos</h3>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={days === 7 ? "default" : "ghost"}
            onClick={() => setDays(7)}
            className="text-xs h-7 px-3"
          >
            7j
          </Button>
          <Button
            size="sm"
            variant={days === 30 ? "default" : "ghost"}
            onClick={() => setDays(30)}
            className="text-xs h-7 px-3"
          >
            30j
          </Button>
        </div>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="dateLabel" stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
            />
            <Legend />
            <Line type="monotone" dataKey="hrv" name="HRV" stroke="hsl(var(--hrv))" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="hrv_ma"
              name="HRV (moy. 7j)"
              stroke="hsl(var(--hrv))"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
              opacity={0.5}
            />
            <Line type="monotone" dataKey="sleep_score" name="Sommeil" stroke="hsl(var(--sleep))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="rhr" name="FC Repos" stroke="hsl(var(--rhr))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

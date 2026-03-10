import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: number | string;
  unit: string;
  trend: number[];
  color: string;
  icon: React.ReactNode;
}

export function KpiCard({ label, value, unit, trend, color, icon }: KpiCardProps) {
  const chartData = trend.map((v, i) => ({ v, i }));

  // Compute day-over-day variation
  let delta: number | null = null;
  let deltaLabel = "";
  if (trend.length >= 2) {
    const current = trend[trend.length - 1];
    const previous = trend[trend.length - 2];
    delta = Math.round((current - previous) * 10) / 10;
    deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
  }

  return (
    <div className="glass-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        {delta !== null && (
          <div className={`flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-primary" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {deltaLabel}{unit}
          </div>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <span className="text-2xl font-display font-bold" style={{ color }}>
            {typeof value === "number" ? Math.round(value) : value}
          </span>
          <span className="text-xs text-muted-foreground ml-1">{unit}</span>
        </div>
        <div className="w-20 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

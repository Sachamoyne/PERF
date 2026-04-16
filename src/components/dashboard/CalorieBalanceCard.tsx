import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, Tooltip, ReferenceLine } from "recharts";
import { Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { parseLocalDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { usePersistedChartPeriod } from "@/hooks/usePersistedChartPeriod";

const PERIODS = [
  { label: "7j", days: 7 },
  { label: "1m", days: 30 },
  { label: "3m", days: 90 },
  { label: "1a", days: 365 },
  { label: "Tout", days: null },
] as const;

type BalancePoint = {
  date: string;
  label: string;
  food: number;
  sport: number;
  smr: number | null;
  value: number | null;
  smrSource: string;
  sportSource: string;
};

function aggregateMonthlyAverage(points: BalancePoint[]): BalancePoint[] {
  const byMonth = new Map<string, BalancePoint[]>();

  for (const point of points) {
    const monthKey = point.date.slice(0, 7);
    const bucket = byMonth.get(monthKey);
    if (bucket) bucket.push(point);
    else byMonth.set(monthKey, [point]);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, bucket]) => {
      const avg = (values: number[]) => Math.round(values.reduce((s, v) => s + v, 0) / values.length);
      const avgNullable = (values: Array<number | null>) => {
        const filtered = values.filter((v): v is number => v != null);
        return filtered.length > 0 ? avg(filtered) : null;
      };

      const [year, month] = monthKey.split("-");
      const monthDate = new Date(Number(year), Number(month) - 1, 1);

      return {
        date: `${monthKey}-01`,
        label: monthDate.toLocaleDateString("fr-FR", { month: "short" }),
        food: avg(bucket.map((p) => p.food)),
        sport: avg(bucket.map((p) => p.sport)),
        smr: avgNullable(bucket.map((p) => p.smr)),
        value: avgNullable(bucket.map((p) => p.value)),
        smrSource: bucket.some((p) => p.smrSource === "server_iphone") ? "server_iphone" : "missing",
        sportSource: bucket.some((p) => p.sportSource === "server_iphone") ? "server_iphone" : "activities_workouts",
      };
    });
}

function useCalorieBalance(days: number | null, date?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calorie_balance", user?.id, days ?? "all", date],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const targetDate = date ? parseLocalDate(date) : new Date();
      const end = targetDate;
      const start = days == null
        ? null
        : subDays(targetDate, Math.max(0, days - 1));
      const startStr = start
        ? `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`
        : null;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

      let foodQuery = supabase
        .from("health_metrics")
        .select("date, value")
        .eq("user_id", user.id)
        .eq("metric_type", "calories_total")
        .lte("date", endStr)
        .order("date", { ascending: true });
      if (startStr) foodQuery = foodQuery.gte("date", startStr);
      const { data: foodRows } = await foodQuery;

      let balanceQuery = supabase
        .from("health_metrics")
        .select("date, value")
        .eq("user_id", user.id)
        .eq("metric_type", "calorie_balance")
        .lte("date", endStr);
      if (startStr) balanceQuery = balanceQuery.gte("date", startStr);
      const { data: balanceRows } = await balanceQuery;

      let smrQuery = supabase
        .from("health_metrics")
        .select("date, value")
        .eq("user_id", user.id)
        .eq("metric_type", "calorie_smr")
        .lte("date", endStr);
      if (startStr) smrQuery = smrQuery.gte("date", startStr);
      const { data: smrRows } = await smrQuery;

      let sportQuery = supabase
        .from("health_metrics")
        .select("date, value")
        .eq("user_id", user.id)
        .eq("metric_type", "calorie_sport")
        .lte("date", endStr);
      if (startStr) sportQuery = sportQuery.gte("date", startStr);
      const { data: sportRows } = await sportQuery;

      let activityQuery = supabase
        .from("activities")
        .select("start_time, calories")
        .eq("user_id", user.id)
        .lte("start_time", `${endStr}T23:59:59.999`);
      if (startStr) activityQuery = activityQuery.gte("start_time", `${startStr}T00:00:00`);
      const { data: activityRows } = await activityQuery;

      const sportByDay: Record<string, number> = {};
      for (const row of activityRows ?? []) {
        const day = row.start_time.split("T")[0];
        sportByDay[day] = (sportByDay[day] ?? 0) + (row.calories ?? 0);
      }

      const balanceByDay: Record<string, number> = {};
      for (const row of balanceRows ?? []) {
        balanceByDay[row.date] = Math.round(row.value);
      }

      const smrByDay: Record<string, number> = {};
      for (const row of smrRows ?? []) {
        smrByDay[row.date] = Math.round(row.value);
      }

      const sportMetricByDay: Record<string, number> = {};
      for (const row of sportRows ?? []) {
        sportMetricByDay[row.date] = Math.round(row.value);
      }

      const byDay: BalancePoint[] = (foodRows ?? []).map((row) => {
        const food = Math.round(row.value);
        const sport = sportMetricByDay[row.date] ?? Math.round(sportByDay[row.date] ?? 0);
        const smr = smrByDay[row.date] ?? null;
        const value = balanceByDay[row.date] ?? (food > 0 && smr != null ? Math.round(food - (smr + sport)) : null);
        return {
          date: row.date,
          label: format(parseLocalDate(row.date), "dd MMM", { locale: fr }),
          food,
          sport,
          smr,
          value,
          smrSource: smrByDay[row.date] != null ? "server_iphone" : "missing",
          sportSource: sportMetricByDay[row.date] != null ? "server_iphone" : "activities_workouts",
        };
      });

      const shouldAggregateMonthly = days == null || days >= 90;
      const series = shouldAggregateMonthly ? aggregateMonthlyAverage(byDay) : byDay;

      const debugDate = date ?? new Date().toISOString().slice(0, 10);
      const debugRow = series.find((d) => d.date === debugDate) ?? series.at(-1);
      console.log("[calorieBalanceCard][debug]", {
        date: debugDate,
        smr: debugRow?.smr ?? null,
        sport: debugRow?.sport ?? 0,
        food: debugRow?.food ?? 0,
        result: debugRow?.value ?? null,
        smrSource: debugRow?.smrSource ?? "missing",
        sportSource: debugRow?.sportSource ?? "activities_workouts",
        monthly: shouldAggregateMonthly,
      });

      return series;
    },
  });
}

export function CalorieBalanceCard({ date, detailPath }: { date?: string; detailPath?: string }) {
  const navigate = useNavigate();
  const [periodIdx, setPeriodIdx] = usePersistedChartPeriod("calorie_balance", PERIODS, 1);
  const period = PERIODS[periodIdx];
  const { data = [], isLoading } = useCalorieBalance(period.days, date);

  const tickInterval = (() => {
    const len = data.filter((d) => d.value !== null).length;
    if (len <= 10) return 0;
    if (len <= 40) return 4;
    if (len <= 120) return 13;
    return Math.max(1, Math.floor(len / 14));
  })();

  const latest = date ? data.find((d) => d.date === date) : data.at(-1);
  const latestValue = latest?.food && latest.food > 0 ? latest.value : null;
  const color = latestValue === null
    ? "hsl(var(--muted-foreground))"
    : latestValue >= 0
      ? "hsl(var(--primary))"
      : "hsl(var(--warning))";

  return (
    <div className="glass-card p-4 flex flex-col gap-2" style={{ minHeight: "180px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 dashboard-card-title">
          <Scale className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (detailPath) navigate(detailPath);
            }}
            className={`transition-colors ${detailPath ? "cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            Balance calorique
          </button>
        </div>
        <span className="text-[9px] text-muted-foreground">food − (SMR + sport)</span>
      </div>

      {/* Valeur du jour */}
      <div className="flex items-baseline gap-1">
        <span className="dashboard-card-value font-display" style={{ color }}>
          {isLoading ? "—" : latestValue !== null ? (latestValue > 0 ? `+${latestValue}` : latestValue) : "—"}
        </span>
        {latestValue !== null && (
          <span className="text-[10px] text-muted-foreground">kcal</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {isLoading
          ? ""
          : latest?.food && latest.food > 0 && latest.smr != null
            ? `SMR ${latest.smr} + sport ${latest.sport} / food ${latest.food}`
            : latest?.food && latest.food > 0
            ? `SMR — + sport ${latest.sport} / food ${latest.food}`
            : "Aucune calorie food enregistrée"}
      </div>

      {/* Bar chart 14j */}
      <div className="flex-1 h-[70px]">
        {isLoading || data.filter((d) => d.value !== null).length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Pas encore de données</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.filter((d) => d.value !== null)} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barSize={8}>
              <XAxis
                dataKey="label"
                fontSize={9}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--primary) / 0.45)",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(v: number) => [`${v > 0 ? "+" : ""}${v} kcal`, "Balance"]}
                labelFormatter={(l) => `Jour ${l}`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
              <Bar
                dataKey="value"
                radius={[2, 2, 0, 0]}
              >
                {data.filter((d) => d.value !== null).map((entry) => {
                  const selected = date && entry.date === date;
                  return (
                    <Cell
                      key={entry.date}
                      fill={selected ? "hsl(var(--primary))" : (entry.value ?? 0) >= 0 ? "hsl(var(--primary))" : "hsl(var(--warning))"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex gap-1 rounded-lg bg-secondary p-0.5 w-fit">
        {PERIODS.map((p, idx) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPeriodIdx(idx)}
            className={`period-pill ${idx === periodIdx ? "period-pill-active" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

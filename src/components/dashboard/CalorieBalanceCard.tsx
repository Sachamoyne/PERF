import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, Tooltip, ReferenceLine } from "recharts";
import { Scale } from "lucide-react";
import { addDays, format, subDays } from "date-fns";
import { fr } from "date-fns/locale";

function useCalorieBalance(days = 14, date?: string) {
  return useQuery({
    queryKey: ["calorie_balance", days, date],
    queryFn: async () => {
      const targetDate = date ? new Date(date) : new Date();
      const start = date ? subDays(targetDate, 7) : subDays(targetDate, days);
      const end = date ? addDays(targetDate, 7) : targetDate;

      const { data } = await supabase
        .from("health_metrics")
        .select("date, value")
        .eq("metric_type", "calorie_balance")
        .gte("date", start.toISOString().split("T")[0])
        .lte("date", end.toISOString().split("T")[0])
        .order("date", { ascending: true });

      return (data ?? []).map((d) => ({
        date: d.date,
        label: format(new Date(d.date), "dd", { locale: fr }),
        value: Math.round(d.value),
      }));
    },
  });
}

export function CalorieBalanceCard({ date }: { date?: string }) {
  const { data = [], isLoading } = useCalorieBalance(14, date);

  const latest = date ? data.find((d) => d.date === date) : data.at(-1);
  const latestValue = latest?.value ?? null;
  const color = latestValue === null
    ? "hsl(var(--muted-foreground))"
    : latestValue >= 0
      ? "hsl(152, 60%, 48%)"
      : "hsl(25, 95%, 53%)";

  return (
    <div className="glass-card p-4 flex flex-col gap-2" style={{ minHeight: "180px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Scale className="h-3.5 w-3.5" />
          <span>Balance calorique</span>
        </div>
        <span className="text-[9px] text-muted-foreground">SMR + sport − food</span>
      </div>

      {/* Valeur du jour */}
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-display font-bold" style={{ color }}>
          {isLoading ? "—" : latestValue !== null ? (latestValue > 0 ? `+${latestValue}` : latestValue) : "—"}
        </span>
        {latestValue !== null && (
          <span className="text-[10px] text-muted-foreground">kcal</span>
        )}
      </div>

      {/* Bar chart 14j */}
      <div className="flex-1 h-[70px]">
        {isLoading || data.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Pas encore de données</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barSize={8}>
              <XAxis
                dataKey="label"
                fontSize={9}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "11px",
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
                {data.map((entry) => {
                  const selected = date && entry.date === date;
                  return (
                    <Cell
                      key={entry.date}
                      fill={selected ? "hsl(217, 91%, 60%)" : "hsl(152, 60%, 48%)"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

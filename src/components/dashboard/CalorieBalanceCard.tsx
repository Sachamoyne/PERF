import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, Cell, ResponsiveContainer, XAxis, Tooltip, ReferenceLine } from "recharts";
import { Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { addDays, format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { parseLocalDate } from "@/lib/utils";

const SMR_KCAL = 2100;
const PARIS_TIMEZONE = "Europe/Paris";

function toParisDateStr(isoString: string): string {
  return new Date(isoString).toLocaleDateString("fr-CA", { timeZone: PARIS_TIMEZONE });
}

async function fetchNativeEnergyMaps(startStr: string, endStr: string): Promise<{
  basalByDay: Record<string, number>;
  activeByDay: Record<string, number>;
}> {
  try {
    const platform = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() ?? "web";
    if (platform !== "ios" && platform !== "android") {
      return { basalByDay: {}, activeByDay: {} };
    }

    const { Health } = await import("@capgo/capacitor-health");
    const healthApi = Health as unknown as {
      queryAggregated: (params: {
        dataType: string;
        startDate: string;
        endDate: string;
        bucket: "day";
        aggregation: "sum";
      }) => Promise<{ samples?: Array<{ startDate: string; value: number | string }> }>;
    };
    const [basal, active] = await Promise.all([
      healthApi.queryAggregated({
        dataType: "basalCalories",
        startDate: new Date(`${startStr}T00:00:00`).toISOString(),
        endDate: new Date(`${endStr}T23:59:59.999`).toISOString(),
        bucket: "day",
        aggregation: "sum",
      }),
      healthApi.queryAggregated({
        dataType: "calories",
        startDate: new Date(`${startStr}T00:00:00`).toISOString(),
        endDate: new Date(`${endStr}T23:59:59.999`).toISOString(),
        bucket: "day",
        aggregation: "sum",
      }),
    ]);

    const basalByDay: Record<string, number> = {};
    for (const s of basal?.samples ?? []) {
      const value = Number(s.value);
      if (Number.isFinite(value)) basalByDay[toParisDateStr(s.startDate)] = value;
    }

    const activeByDay: Record<string, number> = {};
    for (const s of active?.samples ?? []) {
      const value = Number(s.value);
      if (Number.isFinite(value)) activeByDay[toParisDateStr(s.startDate)] = value;
    }

    return { basalByDay, activeByDay };
  } catch {
    return { basalByDay: {}, activeByDay: {} };
  }
}

function useCalorieBalance(days = 14, date?: string) {
  return useQuery({
    queryKey: ["calorie_balance", days, date],
    queryFn: async () => {
      const targetDate = date ? parseLocalDate(date) : new Date();
      const start = date ? subDays(targetDate, 7) : subDays(targetDate, days);
      const end = date ? addDays(targetDate, 7) : targetDate;
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

      const { data: foodRows } = await supabase
        .from("health_metrics")
        .select("date, value")
        .eq("metric_type", "calories_total")
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true });

      const { data: activityRows } = await supabase
        .from("activities")
        .select("start_time, calories")
        .gte("start_time", `${startStr}T00:00:00`)
        .lte("start_time", `${endStr}T23:59:59.999`);

      const { basalByDay, activeByDay } = await fetchNativeEnergyMaps(startStr, endStr);

      const sportByDay: Record<string, number> = {};
      for (const row of activityRows ?? []) {
        const day = toParisDateStr(row.start_time);
        sportByDay[day] = (sportByDay[day] ?? 0) + (row.calories ?? 0);
      }

      const byDay = (foodRows ?? []).map((row) => {
        const food = Math.round(row.value);
        const sport = Math.round(activeByDay[row.date] ?? (sportByDay[row.date] ?? 0));
        const smr = Math.round(basalByDay[row.date] ?? SMR_KCAL);
        const value = food > 0 ? Math.round(food - (smr + sport)) : null;
        return {
          date: row.date,
          label: format(parseLocalDate(row.date), "dd MMM", { locale: fr }),
          food,
          sport,
          smr,
          value,
          smrSource: basalByDay[row.date] != null ? "healthkit_basalCalories" : "fallback_constant",
          sportSource: activeByDay[row.date] != null ? "healthkit_calories(active)" : "activities_workouts",
        };
      });

      const debugDate = date ?? toParisDateStr(new Date().toISOString());
      const debugRow = byDay.find((d) => d.date === debugDate);
      console.log("[calorieBalanceCard][debug]", {
        date: debugDate,
        smr: debugRow?.smr ?? SMR_KCAL,
        sport: debugRow?.sport ?? 0,
        food: debugRow?.food ?? 0,
        result: debugRow?.value ?? null,
        smrSource: debugRow?.smrSource ?? "fallback_constant",
        sportSource: debugRow?.sportSource ?? "activities_workouts",
      });

      return byDay;
    },
  });
}

export function CalorieBalanceCard({ date, detailPath }: { date?: string; detailPath?: string }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useCalorieBalance(14, date);

  const latest = date ? data.find((d) => d.date === date) : data.at(-1);
  const latestValue = latest?.food && latest.food > 0 ? latest.value : null;
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
        <span className="text-xl font-display font-bold" style={{ color }}>
          {isLoading ? "—" : latestValue !== null ? (latestValue > 0 ? `+${latestValue}` : latestValue) : "—"}
        </span>
        {latestValue !== null && (
          <span className="text-[10px] text-muted-foreground">kcal</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        {isLoading
          ? ""
          : latest?.food && latest.food > 0
            ? `SMR ${latest.smr} + sport ${latest.sport} / food ${latest.food}`
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
                {data.filter((d) => d.value !== null).map((entry) => {
                  const selected = date && entry.date === date;
                  return (
                    <Cell
                      key={entry.date}
                      fill={selected ? "hsl(217, 91%, 60%)" : (entry.value ?? 0) >= 0 ? "hsl(152, 60%, 48%)" : "hsl(25, 95%, 53%)"}
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

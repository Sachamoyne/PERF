import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Flame } from "lucide-react";

interface MacroData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  caloriesTarget: number;
}

function useLatestNutrition() {
  return useQuery({
    queryKey: ["latest_nutrition"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const since = new Date();
      since.setDate(since.getDate() - 7);

      const { data } = await supabase
        .from("health_metrics")
        .select("metric_type, value, date")
        .in("metric_type", ["calories_total", "protein"])
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: false });

      if (!data || data.length === 0) return null;

      // Prend la valeur la plus récente pour chaque metric
      const latest: Record<string, number> = {};
      for (const row of data) {
        if (!latest[row.metric_type]) {
          latest[row.metric_type] = row.value;
        }
      }

      return {
        calories: latest["calories_total"] ?? 0,
        protein: latest["protein"] ?? 0,
        caloriesTarget: 3400,
        proteinTarget: 180,
      };
    },
  });
}

export function CaloriesCard() {
  const { data, isLoading } = useLatestNutrition();

  const calories = data?.calories ?? 0;
  const protein = data?.protein ?? 0;
  const caloriesTarget = data?.caloriesTarget ?? 3400;
  const proteinTarget = data?.proteinTarget ?? 180;

  const pct = Math.min((calories / caloriesTarget) * 100, 100);
  const remaining = Math.max(caloriesTarget - calories, 0);

  const donutData = [
    { name: "Consommé", value: Math.min(calories, caloriesTarget) },
    { name: "Restant", value: remaining },
  ];

  return (
    <div className="glass-card p-4 flex flex-col gap-2" style={{ minHeight: "180px" }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flame className="h-3.5 w-3.5" />
        <span>Calories</span>
      </div>

      <div className="flex items-center gap-3 flex-1">
        {/* Donut */}
        <div className="relative w-[80px] h-[80px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={38}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                strokeWidth={0}
                isAnimationActive={false}
              >
                <Cell fill="hsl(25, 95%, 53%)" />
                <Cell fill="hsl(220, 14%, 18%)" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold font-display" style={{ color: "hsl(25, 95%, 53%)" }}>
              {isLoading ? "—" : calories > 0 ? calories.toLocaleString() : "—"}
            </span>
            <span className="text-[9px] text-muted-foreground">kcal</span>
          </div>
        </div>

        {/* Macros */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* Protéines */}
          <div>
            <div className="flex justify-between text-[10px] mb-0.5">
              <span className="text-muted-foreground">P</span>
              <span className="text-foreground font-medium">{isLoading ? "—" : protein}
                <span className="text-muted-foreground">/{proteinTarget}g</span>
              </span>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min((protein / proteinTarget) * 100, 100)}%`,
                  background: "hsl(152, 60%, 48%)",
                }}
              />
            </div>
          </div>

          {/* Calories restantes */}
          <div className="text-[10px] text-muted-foreground mt-1">
            {isLoading ? "" : `${remaining > 0 ? remaining.toLocaleString() + " restantes" : "Objectif atteint ✓"}`}
          </div>

          <div className="text-[9px] text-muted-foreground">
            Objectif : {caloriesTarget.toLocaleString()} kcal
          </div>
        </div>
      </div>
    </div>
  );
}

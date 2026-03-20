import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Flame, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { computeAndSaveCalorieBalance } from "@/services/calorieBalance";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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

      const byType = {
        calories_total: data.filter((row) => row.metric_type === "calories_total"),
        protein: data.filter((row) => row.metric_type === "protein"),
      };

      const pickValue = (rows: typeof data) => {
        const todayRow = rows.find((row) => row.date === today);
        if (todayRow) return todayRow.value;
        return rows[0]?.value ?? 0;
      };

      return {
        calories: pickValue(byType.calories_total),
        protein: pickValue(byType.protein),
        caloriesTarget: 3400,
        proteinTarget: 180,
      };
    },
  });
}

export function CaloriesCard() {
  const { data, isLoading } = useLatestNutrition();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateStr, setDateStr] = useState(new Date().toISOString().split("T")[0]);
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");

  const insertMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const caloriesValue = Number(manualCalories);
      const proteinValue = Number(manualProtein);
      if (!Number.isFinite(caloriesValue) || caloriesValue <= 0) {
        throw new Error("Calories invalides");
      }
      if (!Number.isFinite(proteinValue) || proteinValue <= 0) {
        throw new Error("Protéines invalides");
      }

      const rows = [
        {
          user_id: user.id,
          date: dateStr,
          metric_type: "calories_total" as const,
          value: Math.round(caloriesValue),
          unit: "kcal",
        },
        {
          user_id: user.id,
          date: dateStr,
          metric_type: "protein" as const,
          value: Math.round(proteinValue * 10) / 10,
          unit: "g",
        },
      ];

      const { error } = await supabase
        .from("health_metrics")
        .upsert(rows, { onConflict: "user_id,metric_type,date" });

      if (error) throw error;

      await computeAndSaveCalorieBalance(user.id, dateStr);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["latest_nutrition"] });
      queryClient.invalidateQueries({ queryKey: ["health_metrics"] });
      queryClient.invalidateQueries({ queryKey: ["calorie_balance"] });
      queryClient.invalidateQueries({ queryKey: ["kpi_metric"] });
      toast.success("Nutrition enregistrée");
      setOpen(false);
      setManualCalories("");
      setManualProtein("");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Erreur lors de l'enregistrement");
    },
  });

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className="h-3.5 w-3.5" />
          <span>Calories</span>
        </div>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <Plus className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="bg-card border-border">
            <DrawerHeader>
              <DrawerTitle className="font-display text-foreground">Saisie nutrition</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Calories totales</Label>
                <Input
                  type="number"
                  value={manualCalories}
                  onChange={(e) => setManualCalories(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="3000"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Protéines</Label>
                <Input
                  type="number"
                  value={manualProtein}
                  onChange={(e) => setManualProtein(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="165"
                />
              </div>
            </div>
            <DrawerFooter>
              <Button onClick={() => insertMutation.mutate()} disabled={insertMutation.isPending}>
                {insertMutation.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost">Annuler</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
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

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Flame, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useActivePhase } from "@/hooks/useActivePhase";
import { getParisLocalDateString, useLatestNutrition } from "@/hooks/useLatestNutrition";
import { computeAndSaveCalorieBalance } from "@/services/calorieBalance";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CaloriesCard({ date, detailPath }: { date?: string; detailPath?: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useLatestNutrition(date);
  const { phase } = useActivePhase();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dateStr, setDateStr] = useState(getParisLocalDateString());
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  useEffect(() => {
    if (date) setDateStr(date);
  }, [date]);

  const insertMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      const caloriesValue = Number(manualCalories);
      const proteinValue = Number(manualProtein);
      const carbsValue = Number(manualCarbs);
      const fatValue = Number(manualFat);
      if (!Number.isFinite(caloriesValue) || caloriesValue <= 0) {
        throw new Error("Calories invalides");
      }
      if (!Number.isFinite(proteinValue) || proteinValue <= 0) {
        throw new Error("Protéines invalides");
      }
      if (!Number.isFinite(carbsValue) || carbsValue <= 0) {
        throw new Error("Glucides invalides");
      }
      if (!Number.isFinite(fatValue) || fatValue <= 0) {
        throw new Error("Lipides invalides");
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
        {
          user_id: user.id,
          date: dateStr,
          metric_type: "carbs" as const,
          value: Math.round(carbsValue * 10) / 10,
          unit: "g",
        },
        {
          user_id: user.id,
          date: dateStr,
          metric_type: "fat" as const,
          value: Math.round(fatValue * 10) / 10,
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
      setManualCarbs("");
      setManualFat("");
    },
    onError: (error) => {
      toast.error((error as Error).message || "Erreur lors de l'enregistrement");
    },
  });

  const calories = data?.calories ?? 0;
  const protein = data?.protein ?? 0;
  const caloriesTarget = phase.calories ?? 0;
  const proteinTarget = phase.protein ?? 0;
  const carbsTarget = phase.carbs ?? 0;
  const fatTarget = phase.fat ?? 0;
  const hasTargets = phase.calories != null && phase.protein != null && phase.carbs != null && phase.fat != null;
  const remaining = Math.max(caloriesTarget - calories, 0);

  const donutData = [
    { name: "Consommé", value: Math.min(calories ?? 0, caloriesTarget) },
    { name: "Restant", value: remaining },
  ];

  return (
    <div className="glass-card p-4 flex flex-col gap-2" style={{ minHeight: "180px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 dashboard-card-title">
          <Flame className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (detailPath) navigate(detailPath);
            }}
            className={`transition-colors ${detailPath ? "cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            Calories
          </button>
        </div>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-hidden="true"
              tabIndex={-1}
            >
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
              <div className="space-y-2">
                <Label className="text-muted-foreground">Glucides</Label>
                <Input
                  type="number"
                  value={manualCarbs}
                  onChange={(e) => setManualCarbs(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Lipides</Label>
                <Input
                  type="number"
                  value={manualFat}
                  onChange={(e) => setManualFat(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="100"
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
                <Cell fill="hsl(var(--primary))" />
                <Cell fill="hsl(var(--secondary))" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold font-display" style={{ color: "hsl(var(--primary))" }}>
              {isLoading ? "—" : calories.toLocaleString()}
            </span>
            <span className="text-[9px] text-muted-foreground">kcal</span>
          </div>
        </div>

        {/* Macros */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* Macros P / G / L */}
          <div className="flex flex-col gap-1.5">
            {/* Protéines */}
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-muted-foreground font-medium">P</span>
                <span className="text-foreground font-medium">
                  {isLoading ? "—" : protein}
                  <span className="text-muted-foreground">/{hasTargets ? proteinTarget : "—"}g</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hasTargets && proteinTarget > 0 ? Math.min(((protein ?? 0) / proteinTarget) * 100, 100) : 0}%`,
                    backgroundColor: "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>

            {/* Glucides */}
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-muted-foreground font-medium">G</span>
                <span className="text-foreground font-medium">
                  {isLoading ? "—" : (data?.carbs ?? 0)}
                  <span className="text-muted-foreground">/{hasTargets ? carbsTarget : "—"}g</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hasTargets && carbsTarget > 0 ? Math.min(((data?.carbs ?? 0) / carbsTarget) * 100, 100) : 0}%`,
                    backgroundColor: "hsl(var(--warning))",
                  }}
                />
              </div>
            </div>

            {/* Lipides */}
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-muted-foreground font-medium">L</span>
                <span className="text-foreground font-medium">
                  {isLoading ? "—" : (data?.fat ?? 0)}
                  <span className="text-muted-foreground">/{hasTargets ? fatTarget : "—"}g</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${hasTargets && fatTarget > 0 ? Math.min(((data?.fat ?? 0) / fatTarget) * 100, 100) : 0}%`,
                    backgroundColor: "hsl(var(--primary))",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Calories restantes */}
          <div className="text-[10px] text-muted-foreground mt-1">
            {isLoading ? "" : hasTargets ? `${remaining > 0 ? remaining.toLocaleString() + " restantes" : "Objectif atteint ✓"}` : "Complète ton profil"}
          </div>

          <div className="text-[9px] text-muted-foreground">
            Objectif : {hasTargets ? `${caloriesTarget.toLocaleString()} kcal` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

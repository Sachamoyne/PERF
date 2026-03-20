import { supabase } from "@/integrations/supabase/client";

const BMR = 2100; // Mifflin-St Jeor: homme, 25 ans, 193cm, 80kg

export async function computeAndSaveCalorieBalance(
  userId: string,
  sinceDateStr: string
): Promise<number> {
  // 1. Récupérer calories_total depuis health_metrics
  const { data: calData } = await supabase
    .from("health_metrics")
    .select("date, value")
    .eq("user_id", userId)
    .eq("metric_type", "calories_total")
    .gte("date", sinceDateStr);

  if (!calData || calData.length === 0) return 0;

  // 2. Récupérer calories activités depuis activities
  const { data: actData } = await supabase
    .from("activities")
    .select("start_time, calories")
    .eq("user_id", userId)
    .gte("start_time", `${sinceDateStr}T00:00:00`);

  // 3. Grouper calories activité par jour
  const actCalByDay: Record<string, number> = {};
  for (const a of actData ?? []) {
    const d = a.start_time.split("T")[0];
    actCalByDay[d] = (actCalByDay[d] ?? 0) + (a.calories ?? 0);
  }

  // 4. Calculer et upsert balance
  const balanceRows = calData.map((c) => ({
    user_id: userId,
    date: c.date,
    metric_type: "calorie_balance" as const,
    value: Math.round(c.value - BMR - (actCalByDay[c.date] ?? 0)),
    unit: "kcal",
  }));

  const { error } = await supabase
    .from("health_metrics")
    .upsert(balanceRows, { onConflict: "user_id,metric_type,date" });

  if (error) console.error("[calorieBalance] upsert error:", error);
  else console.log("[calorieBalance] ✓ Balance calculée pour", balanceRows.length, "jours");

  return balanceRows.length;
}

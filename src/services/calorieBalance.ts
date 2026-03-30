import { supabase } from "@/integrations/supabase/client";
const DEV = import.meta.env.DEV;

const BMR = 2100; // Mifflin-St Jeor: homme, 25 ans, 193cm, 80kg
const PARIS_TIMEZONE = "Europe/Paris";

function toParisDateStr(isoString: string): string {
  return new Date(isoString).toLocaleDateString("fr-CA", { timeZone: PARIS_TIMEZONE });
}

async function fetchNativeEnergyMaps(sinceDateStr: string): Promise<{
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
    const start = new Date(`${sinceDateStr}T00:00:00`);
    const end = new Date();

    const [basal, active] = await Promise.all([
      healthApi.queryAggregated({
        dataType: "basalCalories",
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        bucket: "day",
        aggregation: "sum",
      }),
      healthApi.queryAggregated({
        dataType: "calories",
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        bucket: "day",
        aggregation: "sum",
      }),
    ]);

    const basalByDay: Record<string, number> = {};
    for (const s of basal?.samples ?? []) {
      const day = toParisDateStr(s.startDate);
      const value = Number(s.value);
      if (Number.isFinite(value)) basalByDay[day] = value;
    }

    const activeByDay: Record<string, number> = {};
    for (const s of active?.samples ?? []) {
      const day = toParisDateStr(s.startDate);
      const value = Number(s.value);
      if (Number.isFinite(value)) activeByDay[day] = value;
    }

    return { basalByDay, activeByDay };
  } catch (error) {
    if (DEV) console.warn("[calorieBalance] native energy fetch fallback:", error);
    return { basalByDay: {}, activeByDay: {} };
  }
}

export async function computeAndSaveCalorieBalance(
  userId: string,
  sinceDateStr: string
): Promise<number> {
  const { basalByDay, activeByDay } = await fetchNativeEnergyMaps(sinceDateStr);

  // 1. Récupérer food (calories_total) depuis health_metrics
  const { data: calData, error: calError } = await supabase
    .from("health_metrics")
    .select("date, value")
    .eq("user_id", userId)
    .eq("metric_type", "calories_total")
    .gte("date", sinceDateStr);
  if (calError) throw calError;

  // 2. Récupérer sport (calories activités) depuis activities
  const { data: actData, error: actError } = await supabase
    .from("activities")
    .select("start_time, calories")
    .eq("user_id", userId)
    .gte("start_time", `${sinceDateStr}T00:00:00`);
  if (actError) throw actError;

  // 3. Récupérer anciennes balances pour nettoyer les dates sans food
  const { data: existingBalanceRows, error: existingBalanceError } = await supabase
    .from("health_metrics")
    .select("id, date")
    .eq("user_id", userId)
    .eq("metric_type", "calorie_balance")
    .gte("date", sinceDateStr);
  if (existingBalanceError) throw existingBalanceError;

  // 4. Grouper sport par jour local Europe/Paris
  const actCalByDay: Record<string, number> = {};
  for (const a of actData ?? []) {
    const d = toParisDateStr(a.start_time);
    actCalByDay[d] = (actCalByDay[d] ?? 0) + (a.calories ?? 0);
  }

  const foodByDay: Record<string, number> = {};
  for (const c of calData ?? []) {
    foodByDay[c.date] = c.value;
  }

  // 5. Calculer et upsert balance uniquement si food > 0
  const balanceRows = Object.entries(foodByDay)
    .filter(([, food]) => food > 0)
    .map(([date, food]) => {
      const smr = Math.round(basalByDay[date] ?? BMR);
      const sport = Math.round(activeByDay[date] ?? (actCalByDay[date] ?? 0));
      return {
        user_id: userId,
        date,
        metric_type: "calorie_balance" as const,
        value: Math.round(food - (smr + sport)),
        unit: "kcal",
      };
    });

  // 6. Supprimer les anciennes balances quand food = 0 / absent
  const datesWithFood = new Set(balanceRows.map((r) => r.date));
  const staleBalanceIds = (existingBalanceRows ?? [])
    .filter((r) => !datesWithFood.has(r.date))
    .map((r) => r.id);

  if (staleBalanceIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("health_metrics")
      .delete()
      .in("id", staleBalanceIds);
    if (DEV && deleteError) console.error("[calorieBalance] stale delete error:", deleteError);
  }

  if (balanceRows.length > 0) {
    const { error } = await supabase
      .from("health_metrics")
      .upsert(balanceRows, { onConflict: "user_id,metric_type,date" });
    if (DEV && error) console.error("[calorieBalance] upsert error:", error);
  }

  // 7. Debug détaillé (temporaire)
  const debugDates = Object.keys(foodByDay).sort();
  for (const date of debugDates) {
    const food = foodByDay[date] ?? 0;
    const sport = Math.round(activeByDay[date] ?? (actCalByDay[date] ?? 0));
    const smr = Math.round(basalByDay[date] ?? BMR);
    const result = food > 0 ? Math.round(food - (smr + sport)) : null;
    if (DEV) console.log("[calorieBalance][debug]", {
      date,
      smr,
      sport,
      food,
      result,
      smrSource: basalByDay[date] != null ? "healthkit_basalCalories" : "fallback_constant",
      sportSource: activeByDay[date] != null ? "healthkit_calories(active)" : "activities_workouts",
    });
  }

  if (DEV) console.log("[calorieBalance] ✓ Balance calculée pour", balanceRows.length, "jours");

  return balanceRows.length;
}

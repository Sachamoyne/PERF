import { supabase } from "@/integrations/supabase/client";

function rand(min: number, max: number, decimals = 1): number {
  const val = Math.random() * (max - min) + min;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function setTime(d: Date, hour: number, min: number): Date {
  const copy = new Date(d);
  copy.setHours(hour, min, 0, 0);
  return copy;
}

/** Generate 30 days of coherent, realistic data */
export async function generateTestData(userId: string) {
  const today = new Date();
  const metrics: Array<{
    user_id: string;
    date: string;
    metric_type: "hrv" | "sleep_score" | "rhr" | "vo2max" | "body_battery";
    value: number;
    unit: string;
  }> = [];
  const activities: Array<{
    user_id: string;
    sport_type: "running" | "cycling" | "swimming" | "tennis" | "padel" | "strength";
    start_time: string;
    duration_sec: number;
    calories: number;
    avg_hr: number;
    distance_meters: number | null;
    total_elevation_gain: number | null;
  }> = [];

  // Weekly schedule template (0=Monday)
  // Mon: Running 10km + Strength
  // Tue: Tennis
  // Wed: Running 5km
  // Thu: Padel + Strength
  // Fri: Running 12km
  // Sat: Swimming 1500m
  // Sun: Tennis

  const weeklyPlan: Array<{
    dayOfWeek: number; // 0=Mon
    sport: "running" | "tennis" | "padel" | "strength" | "swimming";
    distanceKm?: number;
    durationMin: number;
    avgHr: [number, number]; // [min, max]
    calories: [number, number];
    hour: number;
    elevGain?: number;
  }> = [
    { dayOfWeek: 0, sport: "running", distanceKm: 10, durationMin: 50, avgHr: [150, 162], calories: [480, 550], hour: 7, elevGain: 80 },
    { dayOfWeek: 0, sport: "strength", durationMin: 60, avgHr: [110, 130], calories: [280, 350], hour: 18 },
    { dayOfWeek: 1, sport: "tennis", durationMin: 90, avgHr: [138, 152], calories: [400, 520], hour: 19 },
    { dayOfWeek: 2, sport: "running", distanceKm: 5, durationMin: 25, avgHr: [145, 158], calories: [250, 320], hour: 7 },
    { dayOfWeek: 3, sport: "padel", durationMin: 90, avgHr: [135, 150], calories: [380, 480], hour: 19 },
    { dayOfWeek: 3, sport: "strength", durationMin: 60, avgHr: [110, 130], calories: [280, 350], hour: 12 },
    { dayOfWeek: 4, sport: "running", distanceKm: 12, durationMin: 60, avgHr: [152, 165], calories: [580, 680], hour: 7, elevGain: 120 },
    { dayOfWeek: 5, sport: "swimming", distanceKm: 1.5, durationMin: 45, avgHr: [130, 145], calories: [350, 420], hour: 10 },
    { dayOfWeek: 6, sport: "tennis", durationMin: 90, avgHr: [138, 152], calories: [400, 520], hour: 10 },
  ];

  // HRV trend: slightly improving over 30 days (last 7 days higher)
  const baseHrv = rand(50, 55, 0);

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    const dayIndex = i; // 29 = oldest, 0 = today

    // HRV: trend upward with noise. Last 7 days avg > 30 days avg
    const trendBoost = dayIndex < 7 ? 8 : 0;
    const hrv = Math.round(baseHrv + trendBoost + rand(-6, 6, 0));
    const clampedHrv = Math.max(45, Math.min(75, hrv));

    // Sleep: 6h to 8.5h
    const sleep = rand(6.0, 8.5);

    // RHR: 50-60 bpm, inversely correlated with sleep quality
    const rhr = Math.round(rand(50, 60, 0) + (sleep < 6.5 ? 3 : 0));

    // VO2max: stable with minor fluctuation
    const vo2 = rand(46, 50);

    metrics.push(
      { user_id: userId, date: ds, metric_type: "hrv", value: clampedHrv, unit: "ms" },
      { user_id: userId, date: ds, metric_type: "sleep_score", value: sleep, unit: "h" },
      { user_id: userId, date: ds, metric_type: "rhr", value: Math.min(60, Math.max(50, rhr)), unit: "bpm" },
      { user_id: userId, date: ds, metric_type: "vo2max", value: vo2, unit: "ml/kg/min" },
    );

    // Activities for this day
    const jsDay = d.getDay(); // 0=Sun
    const mondayBased = jsDay === 0 ? 6 : jsDay - 1; // Convert to 0=Mon

    for (const plan of weeklyPlan) {
      if (plan.dayOfWeek !== mondayBased) continue;

      // ~15% chance to skip a session (realistic)
      if (Math.random() < 0.15) continue;

      const basePace = 5.0; // min/km
      let durationSec = Math.round(plan.durationMin * 60 * rand(0.92, 1.08, 2));
      let distMeters: number | null = null;

      if (plan.distanceKm) {
        // For running, compute from pace
        if (plan.sport === "running") {
          const paceVariation = rand(4.7, 5.3, 2); // min/km
          durationSec = Math.round(plan.distanceKm * paceVariation * 60);
          distMeters = Math.round(plan.distanceKm * 1000 * rand(0.97, 1.03, 2));
        } else {
          distMeters = Math.round(plan.distanceKm * 1000 * rand(0.9, 1.1, 2));
        }
      }

      activities.push({
        user_id: userId,
        sport_type: plan.sport,
        start_time: setTime(d, plan.hour, Math.floor(Math.random() * 30)).toISOString(),
        duration_sec: durationSec,
        calories: Math.round(rand(plan.calories[0], plan.calories[1], 0)),
        avg_hr: Math.round(rand(plan.avgHr[0], plan.avgHr[1], 0)),
        distance_meters: distMeters,
        total_elevation_gain: plan.elevGain ? Math.round(rand(plan.elevGain * 0.7, plan.elevGain * 1.3, 0)) : null,
      });
    }
  }

  // Insert metrics in batches
  for (let i = 0; i < metrics.length; i += 100) {
    await supabase.from("health_metrics").insert(metrics.slice(i, i + 100));
  }

  // Insert activities in batches
  for (let i = 0; i < activities.length; i += 50) {
    await supabase.from("activities").insert(activities.slice(i, i + 50));
  }

  // Update profile
  await supabase.from("profiles").upsert({
    user_id: userId,
    full_name: "Athlète Test",
    weight_kg: 75,
    height_cm: 178,
    birth_date: "1992-03-15",
    last_sync: new Date().toISOString(),
  });

  return { metrics: metrics.length, activities: activities.length };
}

export async function clearTestData(userId: string) {
  await supabase.from("exercise_stats").delete().eq("user_id", userId);
  await supabase.from("body_metrics").delete().eq("user_id", userId);
  await supabase.from("health_metrics").delete().eq("user_id", userId);
  await supabase.from("activities").delete().eq("user_id", userId);
}

import { Health } from "@capgo/capacitor-health";
import { requestHealthPermissions, fetchHealthData, toLocalDateStr } from "./health";
import type { HealthSample, SleepSample } from "./health";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { computeAndSaveCalorieBalance } from "@/services/calorieBalance";

export interface DiagnosticReport {
  permissions: {
    authorized: string[];
    denied: string[];
  };
  samples: {
    /** Nombre de jours retournés par queryAggregated (–1 = erreur) */
    steps: number;
    calories: number;
    /** Nombre de samples retournés par readSamples (–1 = erreur) */
    hrv: number;
    sleep: number;
    weight: number;
  };
}

export interface AppleHealthSyncResult {
  importedSamples: number;
  importedHrv: number;
  importedRhr: number;
  importedSleepScore: number;
  importedWeight: number;
  importedBodyFat: number;
  importedWorkouts: number;
  importedSleep: number;
  importedSteps: number;
  importedCalories: number;
  importedProtein: number;
  fetched: {
    hrv: number;
    restingHR: number;
    sleep: number;
    weight: number;
    bodyFat: number;
    workouts: number;
    sleepHours: number;
    steps: number;
    caloriesTotal: number;
    protein: number;
  };
  verified: {
    health_metrics: { hrv: number; rhr: number; sleep_score: number };
    body_metrics: { rows: number };
    activities: { rows: number };
  };
  diagnosticReport: DiagnosticReport;
  lastSync: string;
}

/**
 * Regroupe les échantillons par jour et calcule la moyenne.
 * Garantit une seule ligne par jour (contrainte UNIQUE sur user_id, metric_type, date).
 */
function groupByDayAverage(
  samples: HealthSample[]
): HealthSample[] {
  const map = new Map<string, { sum: number; count: number; unit: string }>();
  for (const s of samples) {
    const prev = map.get(s.date);
    if (prev) {
      prev.sum += s.value;
      prev.count += 1;
    } else {
      map.set(s.date, { sum: s.value, count: 1, unit: s.unit });
    }
  }
  return Array.from(map.entries()).map(([date, { sum, count, unit }]) => ({
    date,
    value: Math.round((sum / count) * 100) / 100,
    unit,
  }));
}

/**
 * Calcule un score de sommeil journalier (0–100) à partir des échantillons de sleep.
 * Formule : min(100, totalSleepMinutes / 480 * 100)
 * Seuls les états actifs (deep, light, rem, asleep) comptent.
 */
function computeSleepScores(
  sleepSamples: SleepSample[]
): HealthSample[] {
  const ACTIVE_STATES = new Set(["deep", "light", "rem", "asleep"]);
  const byDay = new Map<string, number>();

  for (const s of sleepSamples) {
    if (!ACTIVE_STATES.has(s.state)) continue;
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.durationMin);
  }

  return Array.from(byDay.entries()).map(([date, totalMin]) => ({
    date,
    value: Math.min(100, Math.round((totalMin / 480) * 100)),
    unit: "score",
  }));
}

/**
 * Synchronise Apple Health → Supabase (30 derniers jours).
 *
 * Données importées :
 *   health_metrics : hrv, rhr, sleep_score
 *   body_metrics   : weight_kg, body_fat_pc
 *   activities     : workouts (running, cycling, swimming, tennis, padel, strength)
 */
export async function syncAppleHealth(userId: string): Promise<AppleHealthSyncResult> {
  console.info("[appleHealth] Starting sync for user", userId);
  const platform = (() => {
    try { return (window as any).Capacitor?.getPlatform?.() ?? "web"; }
    catch { return "web"; }
  })();
  if (platform !== "ios" && platform !== "android") {
    console.info("[appleHealth] Sync ignoré sur browser — platform:", platform);
    return {
      importedSamples: 0,
      importedHrv: 0,
      importedRhr: 0,
      importedSleepScore: 0,
      importedWeight: 0,
      importedBodyFat: 0,
      importedWorkouts: 0,
      importedSleep: 0,
      importedSteps: 0,
      importedCalories: 0,
      importedProtein: 0,
      fetched: {
        hrv: 0,
        restingHR: 0,
        sleep: 0,
        weight: 0,
        bodyFat: 0,
        workouts: 0,
        sleepHours: 0,
        steps: 0,
        caloriesTotal: 0,
        protein: 0,
      },
      verified: {
        health_metrics: { hrv: 0, rhr: 0, sleep_score: 0 },
        body_metrics: { rows: 0 },
        activities: { rows: 0 },
      },
      diagnosticReport: {
        permissions: { authorized: [], denied: [] },
        samples: { steps: 0, calories: 0, hrv: 0, sleep: 0, weight: 0 },
      },
      lastSync: new Date().toISOString(),
    } satisfies AppleHealthSyncResult;
  }

  // On synchronise depuis le 1er janvier de l'année courante pour alimenter toutes les vues "Année".
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const daysSinceJan1 = Math.max(1, Math.ceil((now.getTime() - jan1.getTime()) / 86_400_000) + 1);

  // ── Étape 1 : Permissions ────────────────────────────────────────────────
  const permissions = await requestHealthPermissions();
  if (!permissions.ok) {
    throw new Error(permissions.reason ?? "Autorisation HealthKit refusée.");
  }
  console.info("[appleHealth] Permissions granted:", permissions.granted ?? []);
  if (permissions.deniedTypes?.length) {
    console.info("[appleHealth] Permissions denied:", permissions.deniedTypes);
  }

  // ── Étape 1b : Diagnostic pré-sync ───────────────────────────────────────
  console.group("[appleHealth] ── ÉTAPE 1b : Diagnostic ──");

  const DIAG_TYPES = [
    "heartRateVariability", "weight", "sleep",
    "steps", "calories", "totalCalories", "basalCalories",
    "bodyFat", "restingHeartRate",
  ];

  // 1. checkAuthorization — état réel des permissions accordées
  let authCheck = { readAuthorized: [] as string[], readDenied: [] as string[] };
  try {
    const res = await (Health as any).checkAuthorization({ read: DIAG_TYPES });
    authCheck = {
      readAuthorized: res.readAuthorized ?? [],
      readDenied:     res.readDenied     ?? [],
    };
    console.log("[appleHealth][diag] checkAuthorization →", authCheck);
  } catch (err) {
    console.warn("[appleHealth][diag] checkAuthorization non disponible :", err);
  }

  // 2. queryAggregated de test (7 derniers jours)
  const diagAgg = async (dataType: string): Promise<number> => {
    try {
      const end   = new Date().toISOString();
      const start = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const result = await (Health as any).queryAggregated({
        dataType, startDate: start, endDate: end, bucket: "day", aggregation: "sum",
      });
      const count = (result.samples ?? []).length;
      console.log(`[appleHealth][diag] queryAggregated(${dataType}) → ${count} jours`);
      return count;
    } catch (err) {
      console.warn(`[appleHealth][diag] queryAggregated(${dataType}) échoué :`, err);
      return -1;
    }
  };

  // 3. readSamples de test (7 derniers jours)
  const diagRead = async (dataType: string, limit: number): Promise<number> => {
    try {
      const end   = new Date().toISOString();
      const start = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const result = await (Health as any).readSamples({
        dataType, startDate: start, endDate: end, limit, ascending: true,
      });
      const count = (result.samples ?? []).length;
      console.log(`[appleHealth][diag] readSamples(${dataType}, limit=${limit}) → ${count} samples`);
      return count;
    } catch (err) {
      console.warn(`[appleHealth][diag] readSamples(${dataType}) échoué :`, err);
      return -1;
    }
  };

  const [diagSteps, diagCalories, diagHrv, diagSleep, diagWeight] = await Promise.all([
    diagAgg("steps"),
    diagAgg("totalCalories"),
    diagRead("heartRateVariability", 5),
    diagRead("sleep", 10),
    diagRead("weight", 5),
  ]);

  const diagnosticReport: DiagnosticReport = {
    permissions: {
      authorized: authCheck.readAuthorized,
      denied:     authCheck.readDenied,
    },
    samples: {
      steps:    diagSteps,
      calories: diagCalories,
      hrv:      diagHrv,
      sleep:    diagSleep,
      weight:   diagWeight,
    },
  };

  console.log("[appleHealth][diag] ═══ RAPPORT DIAGNOSTIC ═══", diagnosticReport);
  console.groupEnd();

  // ── Étape 2 : Récupération des données ───────────────────────────────────
  const snapshot = await fetchHealthData(daysSinceJan1);
  console.info("[appleHealth] Raw samples fetched", {
    hrv:           snapshot.hrv.length,
    weight:        snapshot.weight.length,
    restingHR:     snapshot.restingHR.length,
    bodyFat:       snapshot.bodyFat.length,
    sleep:         snapshot.sleep.length,
    workouts:      snapshot.workouts.length,
    sleepHours:    snapshot.sleepHours.length,
    steps:         snapshot.steps.length,
    caloriesTotal: snapshot.caloriesTotal.length,
    protein:       snapshot.protein.length,
  });

  // ── Étape 3 : Préparation ────────────────────────────────────────────────
  const hrvByDay       = groupByDayAverage(snapshot.hrv);
  const rhrByDay       = groupByDayAverage(snapshot.restingHR);
  const sleepScoreByDay = computeSleepScores(snapshot.sleep);
  const weightByDay    = groupByDayAverage(snapshot.weight);
  const bodyFatByDay   = groupByDayAverage(snapshot.bodyFat);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 60);
  const sinceDateStr = toLocalDateStr(sinceDate.toISOString());

  let importedHrv        = 0;
  let importedRhr        = 0;
  let importedSleepScore = 0;
  let importedWeight     = 0;
  let importedBodyFat    = 0;
  let importedWorkouts   = 0;
  let importedSleep      = 0;
  let importedSteps      = 0;
  let importedCalories   = 0;
  let importedProtein    = 0;

  // ── Étape 4a : HRV → health_metrics ─────────────────────────────────────
  if (hrvByDay.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = hrvByDay.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "hrv" as const,
      value:       s.value,
      unit:        "ms",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] HRV upsert error:", error);
    else importedHrv = rows.length;
    console.log("[appleHealth] ✓ HRV :", importedHrv);
  }

  // ── Étape 4b : Resting HR → health_metrics ───────────────────────────────
  if (rhrByDay.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = rhrByDay.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "rhr" as const,
      value:       s.value,
      unit:        "bpm",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] RHR upsert error:", error);
    else importedRhr = rows.length;
    console.log("[appleHealth] ✓ RHR :", importedRhr);
  }

  // ── Étape 4c : Sleep Score → health_metrics ──────────────────────────────
  if (sleepScoreByDay.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = sleepScoreByDay.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "sleep_score" as const,
      value:       s.value,
      unit:        "score",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] sleep_score upsert error:", error);
    else importedSleepScore = rows.length;
    console.log("[appleHealth] ✓ Sleep score :", importedSleepScore);
  }

  // ── Étape 4d : Steps → health_metrics ────────────────────────────────────
  if (snapshot.steps.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = snapshot.steps.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "steps" as const,
      value:       s.value,
      unit:        "count",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] steps insert error:", error);
    else importedSteps = rows.length;
    console.log("[appleHealth] ✓ Steps :", importedSteps);
  }

  // ── Étape 4e : Calories totales → health_metrics ─────────────────────────
  if (snapshot.caloriesTotal.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = snapshot.caloriesTotal.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "calories_total" as const,
      value:       s.value,
      unit:        "kcal",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] calories_total insert error:", error);
    else importedCalories = rows.length;
    console.log("[appleHealth] ✓ Calories totales :", importedCalories);
  }

  // ── Étape 4f : Protéines → health_metrics ────────────────────────────────
  if (snapshot.protein.length > 0) {
    const rows: TablesInsert<"health_metrics">[] = snapshot.protein.map((s) => ({
      user_id:     userId,
      date:        s.date,
      metric_type: "protein" as const,
      value:       s.value,
      unit:        "g",
    }));
    const { error } = await supabase
      .from("health_metrics")
      .upsert(rows, { onConflict: "user_id,metric_type,date" });
    if (error) console.error("[appleHealth] protein upsert error:", error);
    else importedProtein = rows.length;
    console.log("[appleHealth] ✓ Protéines :", importedProtein);
  }

  // ── Étape 4i : Poids + Masse grasse → body_metrics ───────────────────────
  {
    // Fusionner poids et masse grasse par date
    const bodyMap = new Map<string, { weight_kg?: number; body_fat_pc?: number }>();
    for (const s of weightByDay) {
      bodyMap.set(s.date, { ...(bodyMap.get(s.date) ?? {}), weight_kg: s.value });
    }
    for (const s of bodyFatByDay) {
      bodyMap.set(s.date, { ...(bodyMap.get(s.date) ?? {}), body_fat_pc: s.value });
    }

    if (bodyMap.size > 0) {
      const rows: TablesInsert<"body_metrics">[] = Array.from(bodyMap.entries()).map(
        ([date, metrics]) => ({
          user_id:     userId,
          date,
          source:      "apple_health",
          weight_kg:   metrics.weight_kg,
          body_fat_pc: metrics.body_fat_pc,
        })
      );

      const { error } = await supabase
        .from("body_metrics")
        .upsert(rows, { onConflict: "user_id,date,source" });
      if (error) {
        console.error("[appleHealth] body_metrics upsert error:", error);
      } else {
        importedWeight  = weightByDay.length;
        importedBodyFat = bodyFatByDay.length;
      }
      console.log("[appleHealth] ✓ Poids :", importedWeight, "| Masse grasse :", importedBodyFat);
    }
  }

  // ── Étape 4j : Workouts → activities ─────────────────────────────────────
  if (snapshot.workouts.length > 0) {
    const startDate = jan1.toISOString();

    const makeActivityKey = (x: {
      start_time: string;
      sport_type: string;
      duration_sec: number;
      distance_meters: number | null;
      calories: number | null;
    }) => {
      const minuteKey = x.start_time ? x.start_time.slice(0, 16) : "";
      const distKey = Math.round(((x.distance_meters ?? 0) as number) / 10) * 10; // 10m
      const durKey = Math.round((x.duration_sec ?? 0) / 5) * 5; // 5s
      const calKey = x.calories == null ? "" : Math.round(x.calories / 10) * 10;
      return `${minuteKey}|${x.sport_type}|${distKey}|${durKey}|${calKey}`;
    };

    // Charger les activités existantes pour dédupliquer de manière robuste
    const { data: existing } = await supabase
      .from("activities")
      .select("id,start_time,sport_type,duration_sec,distance_meters,calories")
      .eq("user_id", userId)
      .gte("start_time", startDate);

    const existingKeys = new Set(
      (existing ?? []).map((a: any) =>
        makeActivityKey({
          start_time: a.start_time,
          sport_type: a.sport_type,
          duration_sec: a.duration_sec,
          distance_meters: a.distance_meters,
          calories: a.calories,
        })
      )
    );

    const newWorkouts = snapshot.workouts.filter((w) => {
      const key = makeActivityKey({
        start_time: w.startTime,
        sport_type: w.sportType,
        duration_sec: w.durationSec,
        distance_meters: w.distanceMeters ? Math.round(w.distanceMeters) : null,
        calories: w.calories ? Math.round(w.calories) : null,
      });
      return !existingKeys.has(key);
    });

    if (newWorkouts.length > 0) {
      const rows: TablesInsert<"activities">[] = newWorkouts.map((w) => ({
        user_id:      userId,
        start_time:   w.startTime,
        sport_type:   w.sportType as any,
        duration_sec: w.durationSec,
        calories:     w.calories ? Math.round(w.calories) : null,
        distance_meters: w.distanceMeters ? Math.round(w.distanceMeters) : null,
        total_elevation_gain: w.elevationGain ?? null,
      }));

      const { error } = await supabase.from("activities").insert(rows);
      if (error) console.error("[appleHealth] Activities insert error:", error);
      else importedWorkouts = rows.length;
      console.log("[appleHealth] ✓ Workouts :", importedWorkouts);
    }

    // Nettoyage: supprimer les doublons déjà présents (même séance importée plusieurs fois)
    // On garde la première occurrence (chronologiquement) et on supprime les suivantes.
    const activitiesToCheck = (existing ?? []).concat(
      newWorkouts.map((w) => ({
        id: null,
        start_time: w.startTime,
        sport_type: w.sportType,
        duration_sec: w.durationSec,
        distance_meters: w.distanceMeters ? Math.round(w.distanceMeters) : null,
        calories: w.calories ? Math.round(w.calories) : null,
      }))
    );

    // Recharger depuis la DB pour avoir des IDs réels et une vision complète après insert
    const { data: allRecent } = await supabase
      .from("activities")
      .select("id,start_time,sport_type,duration_sec,distance_meters,calories")
      .eq("user_id", userId)
      .gte("start_time", startDate)
      .order("start_time", { ascending: true });

    const seen = new Map<string, string>();
    const dupIds: string[] = [];
    for (const a of allRecent ?? []) {
      const key = makeActivityKey(a as any);
      const existingId = seen.get(key);
      if (!existingId) {
        seen.set(key, a.id);
      } else {
        dupIds.push(a.id);
      }
    }

    if (dupIds.length > 0) {
      console.warn("[appleHealth] Removing duplicate activities:", dupIds.length);
      for (let i = 0; i < dupIds.length; i += 100) {
        const chunk = dupIds.slice(i, i + 100);
        // eslint-disable-next-line no-await-in-loop
        const { error: delError } = await supabase.from("activities").delete().in("id", chunk);
        if (delError) console.error("[appleHealth] Duplicate delete error:", delError);
      }
    }
  }

  // ── Mise à jour last_sync ─────────────────────────────────────────────────
  const lastSync = new Date().toISOString();
  await supabase
    .from("profiles")
    .update({ last_sync: lastSync })
    .eq("user_id", userId);

  // ── Étape 5 : Vérification post-import (RLS / visibilité) ─────────────────
  const sinceTs = sinceDate.toISOString();

  const [hmHrv, hmRhr, hmSleep, bm, acts] = await Promise.all([
    supabase.from("health_metrics").select("id", { count: "exact", head: true }).eq("metric_type", "hrv").gte("date", sinceDateStr),
    supabase.from("health_metrics").select("id", { count: "exact", head: true }).eq("metric_type", "rhr").gte("date", sinceDateStr),
    supabase.from("health_metrics").select("id", { count: "exact", head: true }).eq("metric_type", "sleep_score").gte("date", sinceDateStr),
    supabase.from("body_metrics").select("id", { count: "exact", head: true }).gte("date", sinceDateStr),
    supabase.from("activities").select("id", { count: "exact", head: true }).gte("start_time", sinceTs),
  ]);

  const verified = {
    health_metrics: {
      hrv: hmHrv.count ?? 0,
      rhr: hmRhr.count ?? 0,
      sleep_score: hmSleep.count ?? 0,
    },
    body_metrics: { rows: bm.count ?? 0 },
    activities: { rows: acts.count ?? 0 },
  };

  console.info("[appleHealth] Post-import visibility check", verified);

  const importedSamples =
    importedHrv + importedRhr + importedSleepScore +
    importedWeight + importedBodyFat + importedWorkouts +
    importedSleep + importedSteps + importedCalories + importedProtein;

  console.info("[appleHealth] Sync completed", {
    importedHrv, importedRhr, importedSleepScore,
    importedWeight, importedBodyFat, importedWorkouts,
    importedSleep, importedSteps, importedCalories, importedProtein,
    lastSync,
  });

  await computeAndSaveCalorieBalance(userId, sinceDateStr);

  return {
    importedSamples,
    importedHrv, importedRhr, importedSleepScore,
    importedWeight, importedBodyFat, importedWorkouts,
    importedSleep, importedSteps, importedCalories, importedProtein,
    fetched: {
      hrv:           snapshot.hrv.length,
      restingHR:     snapshot.restingHR.length,
      sleep:         snapshot.sleep.length,
      weight:        snapshot.weight.length,
      bodyFat:       snapshot.bodyFat.length,
      workouts:      snapshot.workouts.length,
      sleepHours:    snapshot.sleepHours.length,
      steps:         snapshot.steps.length,
      caloriesTotal: snapshot.caloriesTotal.length,
      protein:       snapshot.protein.length,
    },
    verified,
    diagnosticReport,
    lastSync,
  };
}

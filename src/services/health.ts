/**
 * HealthKit Bridge — @capgo/capacitor-health v8
 *
 * Valid HealthDataType values (from plugin definitions):
 *   'steps' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'sleep' |
 *   'respiratoryRate' | 'oxygenSaturation' | 'restingHeartRate' |
 *   'heartRateVariability' | 'bloodPressure' | 'bloodGlucose' |
 *   'bodyTemperature' | 'height' | 'flightsClimbed' | 'exerciseTime' |
 *   'distanceCycling' | 'bodyFat' | 'basalCalories' |
 *   'mindfulness'
 *
 * NOTE: "workout", "activeEnergyBurned", "bodyFatPercentage", "leanBodyMass",
 *       "bmi", "vo2max" are NOT valid types → they crash the
 *       native bridge and land in catch → "Impossible de demander l'autorisation".
 *       Workouts are fetched via Health.queryWorkouts() separately.
 */

import { Health } from "@capgo/capacitor-health";
import type { Workout } from "@capgo/capacitor-health/dist/esm/definitions";
const DEV = import.meta.env.DEV;

export function toLocalDateStr(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Diagnostic au chargement ────────────────────────────────────────────────
if (!Health) {
  if (DEV) console.error(
    "[health] PLUGIN_NOT_FOUND — Health est falsy au chargement du module.\n" +
    "→ Vérifier que @capgo/capacitor-health est listé dans package.json et installé.\n" +
    "→ Relancer : npm install && npx cap sync && Clean Build Folder dans Xcode."
  );
} else {
  if (DEV) console.log("[health] ✓ Health plugin chargé");
  if (DEV) console.log("[health] Plugin Object Keys     :", Object.keys(Health));
  if (DEV) console.log("[health] window.Capacitor.Plugins.Health :", (window as any).Capacitor?.Plugins?.Health ?? "(non encore injecté)");
}

// ─── Types locaux ─────────────────────────────────────────────────────────────

export interface HealthSample {
  date: string;   // YYYY-MM-DD
  value: number;
  unit: string;
}

export interface SleepSample {
  date: string;        // YYYY-MM-DD de la nuit (date de fin ou date de début si < midi)
  state: string;       // deep | light | rem | asleep | awake | inBed
  durationMin: number; // durée en minutes
}

export interface WorkoutData {
  startTime: string;      // ISO 8601
  date: string;           // YYYY-MM-DD
  sportType: string;      // valeur mappée vers sport_type enum
  durationSec: number;
  calories?: number;
  distanceMeters?: number;
  elevationGain?: number; // dénivelé positif en mètres
  source?: string;
}

export interface HealthSnapshot {
  hrv:           HealthSample[];
  weight:        HealthSample[];
  restingHR:     HealthSample[];
  bodyFat:       HealthSample[];
  sleep:         SleepSample[];
  workouts:      WorkoutData[];
  sleepHours:    HealthSample[];   // non sync (saisie manuelle), conservé pour compatibilité
  steps:         HealthSample[];   // total pas par jour (count)
  caloriesTotal: HealthSample[];   // calories alimentaires consommées / jour (dietaryEnergyConsumed, kcal)
  protein:       HealthSample[];   // protéines journalières (g)
  carbohydrates: HealthSample[];   // glucides journaliers (g)
  fat:           HealthSample[];   // lipides journaliers (g)
}

export interface HealthPermissionResult {
  ok: boolean;
  denied?: boolean; // true si l'utilisateur a explicitement refusé dans iOS
  reason?: string;
  granted?: string[];
  deniedTypes?: string[];
}

export interface HealthAuthorizationCheckResult {
  authorized: string[];
  denied: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatErrorDetails(err: unknown): Record<string, unknown> {
  const e = err as any;
  if (!e || typeof e !== "object") return { message: String(err) };
  return {
    name: e.name,
    message: e.message,
    code: e.code,
    status: e.status ?? e.statusCode,
    details: e.details,
    hint: e.hint,
    cause: e.cause,
    stack: e.stack,
  };
}

function logHealthFetchError(context: string, err: unknown) {
  const details = formatErrorDetails(err);
  if (DEV) console.warn(`[health] ${context} failed`, details);
}

function getPlatform(): "ios" | "android" | "web" {
  try {
    return (window as any).Capacitor?.getPlatform?.() ?? "web";
  } catch {
    return "web";
  }
}

function isoRange(days: number): { startDate: string; endDate: string } {
  return {
    startDate: new Date(Date.now() - days * 86_400_000).toISOString(),
    endDate:   new Date().toISOString(),
  };
}

/**
 * Fenêtre locale sur jours civils complets:
 * start = J-<days> à 00:00:00 local, end = aujourd'hui 23:59:59.999 local.
 * Convertie en ISO UTC pour HealthKit.
 */
function localDayIsoRange(days: number): { startDate: string; endDate: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

/** Retourne YYYY-MM-DD en attribuant les données de nuit à la date de fin si < 14h */
function sleepNightDate(isoDate: string): string {
  const d = new Date(isoDate);
  // Si l'heure de fin est avant 14h, on attribue à cette date (nuit précédente)
  // Sinon à la date courante
  if (d.getHours() < 14) {
    return toLocalDateStr(isoDate);
  }
  return toLocalDateStr(isoDate);
}

/** Regroupe les échantillons par jour et calcule la moyenne journalière. */
function groupByDayAverage(samples: HealthSample[]): HealthSample[] {
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

/** Regroupe les échantillons par jour et additionne les valeurs (pas de moyenne). */
function groupByDaySum(samples: HealthSample[]): HealthSample[] {
  const map = new Map<string, { sum: number; unit: string }>();
  for (const s of samples) {
    const prev = map.get(s.date);
    if (prev) {
      prev.sum += s.value;
    } else {
      map.set(s.date, { sum: s.value, unit: s.unit });
    }
  }
  return Array.from(map.entries()).map(([date, { sum, unit }]) => ({
    date,
    value: Math.round(sum * 10) / 10,
    unit,
  }));
}

/**
 * Mappe un WorkoutType HealthKit vers le sport_type de la base de données.
 * Retourne null si le type n'est pas supporté.
 */
function mapWorkoutType(workoutType: string): "running" | "cycling" | "swimming" | "tennis" | "padel" | "strength" | null {
  const raw = workoutType ?? "";
  const normalized = raw
    .replace("HKWorkoutActivityType", "")
    .replace(/[^A-Za-z]/g, "")
    .trim();
  const key = normalized
    ? normalized.charAt(0).toLowerCase() + normalized.slice(1)
    : raw;

  switch (key) {
    case "running":
    case "runningTreadmill":
    case "trackAndField":
      return "running";
    case "cycling":
    case "bikingStationary":
    case "distanceCycling":
      return "cycling";
    case "swimming":
    case "swimmingPool":
    case "swimmingOpenWater":
    case "waterFitness":
      return "swimming";
    case "tennis":
    case "tableTennis":
      return "tennis";
    case "squash":
    case "racquetball":
    case "paddleSports":
      return "padel";
    case "strengthTraining":
    case "traditionalStrengthTraining":
    case "functionalStrengthTraining":
    case "weightlifting":
    case "crossTraining":
    case "highIntensityIntervalTraining":
      return "strength";
    default:
      // Fallback heuristics: different plugins/versions can return variants
      // like "outdoorRun", "run", "functionalStrengthTraining", etc.
      {
        const k = key.toLowerCase();
        if (k.includes("run")) return "running";
        if (k.includes("cycle") || k.includes("bike")) return "cycling";
        if (k.includes("swim")) return "swimming";
        if (k.includes("tennis")) return "tennis";
        if (k.includes("paddle") || k.includes("padel") || k.includes("racquet")) return "padel";
        if (k.includes("strength") || k.includes("weight") || k.includes("cross") || k.includes("hiit")) return "strength";
      }
      return null;
  }
}

// ─── ÉTAPE 1 : Permissions ───────────────────────────────────────────────────

export async function requestHealthPermissions(): Promise<HealthPermissionResult> {
  console.group("[health] ── ÉTAPE 1 : Permissions ──");

  if (getPlatform() !== "ios") {
    console.info("[health] Plateforme non-iOS → skip (données démo actives)");
    console.groupEnd();
    return { ok: true };
  }

  if (!Health) {
    console.error("[health] PLUGIN_NOT_FOUND");
    console.groupEnd();
    return {
      ok: false,
      reason: "Le plugin Apple Health n'est pas chargé. Relance npx cap sync ios puis rebuild dans Xcode.",
    };
  }

  try {
    if (DEV) console.log("[health] → Health.isAvailable()...");
    const availability = await Health.isAvailable();
    if (DEV) console.log("[health] ← isAvailable :", JSON.stringify(availability));

    if (!availability.available) {
      const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
      const reason = ua.includes("simulator")
        ? "Apple Santé n'est pas disponible sur le simulateur iOS. Lance l'app sur un iPhone physique."
        : "Apple Santé n'est pas disponible sur cet appareil.";
      if (DEV) console.error("[health] HealthKit indisponible :", availability.reason ?? availability.platform);
      console.groupEnd();
      return { ok: false, reason };
    }

    // IMPORTANT : uniquement les types supportés par @capgo/capacitor-health.
    const read = [
      "heartRateVariability",
      "weight",
      "sleep",
      "steps",
      "calories",
      "basalCalories",
      "bodyFat",
      "restingHeartRate",
      "dietaryProtein",
      "dietaryCarbohydrates",
      "dietaryFat",
      "dietaryEnergyConsumed",
    ];
    if (DEV) console.log("[health] → Health.requestAuthorization(read):", read.join(", "));
    const status = await Health.requestAuthorization({ read: read as any, write: [] });
    if (DEV) console.log("[health] ← requestAuthorization :", JSON.stringify(status));

    const granted = status.readAuthorized ?? [];
    const denied  = status.readDenied    ?? [];

    if (granted.length === 0 && denied.length > 0) {
      if (DEV) console.warn("[health] Tous les types refusés explicitement");
      console.groupEnd();
      return {
        ok: false,
        reason: "Accès Apple Santé refusé. Va dans Réglages > Santé > Accès des apps > Mova pour autoriser.",
      };
    }

    // Si notDetermined ou partiellement granted → continuer quand même
    if (DEV) console.log("[health] Continuer malgré granted partiel:", granted, "denied:", denied);
    console.groupEnd();
    return { ok: true, granted, deniedTypes: denied };

  } catch (err) {
    if (DEV) console.error("[health] Exception requestHealthPermissions :", err);
    console.groupEnd();
    return {
      ok: false,
      reason: "Impossible de demander l'autorisation Apple Santé. Vérifie la config iOS (Info.plist, entitlement HealthKit) et relance sur iPhone physique.",
    };
  }
}

export async function checkHealthAuthorization(): Promise<HealthAuthorizationCheckResult> {
  if (getPlatform() !== "ios") {
    return { authorized: [], denied: [] };
  }

  if (!Health || typeof (Health as any).checkAuthorization !== "function") {
    return { authorized: [], denied: [] };
  }

  try {
    const res = await (Health as any).checkAuthorization({
      read: [
        "heartRateVariability",
        "restingHeartRate",
        "sleep",
        "weight",
        "bodyFat",
        "steps",
        "dietaryProtein",
        "dietaryCarbohydrates",
        "dietaryFat",
      ],
    });
    return {
      authorized: res.readAuthorized ?? [],
      denied: res.readDenied ?? [],
    };
  } catch {
    return { authorized: [], denied: [] };
  }
}

// ─── ÉTAPE 2 : Fetch individuels ─────────────────────────────────────────────

async function fetchSamples(dataType: string, days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);
  try {
    const result = await Health.readSamples({
      dataType: dataType as any,
      startDate,
      endDate,
      limit: 5000,
      ascending: true,
    });
    return (result.samples ?? [])
      .map((s) => {
        const date = toLocalDateStr(s.startDate);
        let value = Number(s.value);
        let unit = s.unit ?? "";

        // HealthKit body fat is often returned as a fraction (0.18) instead of percent (18)
        if (dataType === "bodyFat" && Number.isFinite(value) && value > 0 && value <= 1.5) {
          value = Math.round(value * 10000) / 100; // 0.1834 → 18.34
          unit = "%";
        }

        return { date, value, unit };
      })
      .filter((s) => Number.isFinite(s.value) && s.value > 0);
  } catch (err) {
    logHealthFetchError(`readSamples(${dataType})`, err);
    return [];
  }
}

async function fetchNativeSleep(days: number): Promise<SleepSample[]> {
  const { startDate, endDate } = isoRange(days);
  try {
    const result = await Health.readSamples({
      dataType: "sleep",
      startDate,
      endDate,
      limit: 5000,
      ascending: true,
    });
    return (result.samples ?? [])
      .filter((s) => s.sleepState && s.sleepState !== "inBed")
      .map((s) => {
        const start = new Date(s.startDate).getTime();
        const end   = new Date(s.endDate).getTime();
        const durationMin = Math.round((end - start) / 60_000);
        return {
          date:        sleepNightDate(s.endDate),
          state:       s.sleepState ?? "asleep",
          durationMin: durationMin > 0 ? durationMin : 0,
        };
      })
      .filter((s) => s.durationMin > 0);
  } catch (err) {
    logHealthFetchError("readSamples(sleep)", err);
    return [];
  }
}

/** Récupère les pas journaliers via queryAggregated (sum par bucket "day"). */
async function fetchDailySteps(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);
  try {
    const result = await (Health as any).queryAggregated({
      dataType: "steps",
      startDate,
      endDate,
      bucket: "day",
      aggregation: "sum",
    });
    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => ({
        date:  toLocalDateStr(s.startDate),
        value: Math.round(Number(s.value)),
        unit:  "count",
      }))
      .filter((s: HealthSample) => Number.isFinite(s.value) && s.value > 0);
    if (DEV) console.log(`[health] fetchDailySteps: ${samples.length} jours`);
    return samples;
  } catch (err) {
    logHealthFetchError("queryAggregated(steps)", err);
    return [];
  }
}

/**
 * Récupère les calories alimentaires consommées (dietaryEnergyConsumed)
 * puis agrège par jour local.
 */
async function fetchDailyCalories(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = localDayIsoRange(days);
  try {
    const result = await Health.readSamples({
      startDate,
      endDate,
      dataType: "dietaryEnergyConsumed" as any,
      ascending: true,
      limit: 10000,
    });

    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => ({
        date: toLocalDateStr(s.startDate),
        value: typeof s.value === "number" ? s.value : Number(s.value),
        unit: "kcal",
      }))
      .filter((s: HealthSample) => Number.isFinite(s.value) && s.value > 0);

    const byDay = groupByDaySum(samples).map((s) => ({ ...s, unit: "kcal" }));
    const today = toLocalDateStr(new Date().toISOString());
    const todayTotal = byDay.find((s) => s.date === today)?.value ?? 0;
    const rawUnits = Array.from(new Set((result.samples ?? []).map((s: any) => String(s.unit ?? "unknown"))));
    if (DEV) console.log("[health] fetchDailyCalories(dietaryEnergyConsumed):", {
      rawSamples: samples.length,
      aggregatedDays: byDay.length,
      rawUnits,
      today,
      todayTotalKcal: Math.round(todayTotal * 10) / 10,
    });
    return byDay;
  } catch (err) {
    logHealthFetchError("readSamples(dietaryEnergyConsumed)", err);
    return [];
  }
}

async function fetchDietaryProtein(days: number): Promise<HealthSample[]> {
  try {
    const { startDate: startStr, endDate: endStr } = localDayIsoRange(days);

    const result = await Health.readSamples({
      startDate: startStr,
      endDate: endStr,
      dataType: "dietaryProtein" as any,
      ascending: true,
    });

    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => ({
        date: toLocalDateStr(s.startDate),
        value: typeof s.value === "number" ? Math.round(s.value * 10) / 10 : 0,
        unit: "g",
      }))
      .filter((s: HealthSample) => s.value > 0);

    const byDay = groupByDaySum(samples).map((s) => ({ ...s, unit: "g" }));
    if (DEV) console.log("[health] fetchDietaryProtein:", { rawSamples: samples.length, aggregatedDays: byDay.length });
    return byDay;
  } catch (err) {
    logHealthFetchError("readSamples(dietaryProtein)", err);
    return [];
  }
}

async function fetchDietaryCarbohydrates(days: number): Promise<HealthSample[]> {
  try {
    const { startDate: startStr, endDate: endStr } = localDayIsoRange(days);

    const result = await Health.readSamples({
      startDate: startStr,
      endDate: endStr,
      dataType: "dietaryCarbohydrates" as any,
      ascending: true,
    });

    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => ({
        date: toLocalDateStr(s.startDate),
        value: typeof s.value === "number" ? Math.round(s.value * 10) / 10 : 0,
        unit: "g",
      }))
      .filter((s: HealthSample) => s.value > 0);

    const byDay = groupByDaySum(samples).map((s) => ({ ...s, unit: "g" }));
    if (DEV) console.log("[health] fetchDietaryCarbohydrates:", { rawSamples: samples.length, aggregatedDays: byDay.length });
    return byDay;
  } catch (err) {
    logHealthFetchError("readSamples(dietaryCarbohydrates)", err);
    return [];
  }
}

async function fetchDietaryFat(days: number): Promise<HealthSample[]> {
  try {
    const { startDate: startStr, endDate: endStr } = localDayIsoRange(days);

    const result = await Health.readSamples({
      startDate: startStr,
      endDate: endStr,
      dataType: "dietaryFat" as any,
      ascending: true,
    });

    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => ({
        date: toLocalDateStr(s.startDate),
        value: typeof s.value === "number" ? Math.round(s.value * 10) / 10 : 0,
        unit: "g",
      }))
      .filter((s: HealthSample) => s.value > 0);

    const byDay = groupByDaySum(samples).map((s) => ({ ...s, unit: "g" }));
    if (DEV) console.log("[health] fetchDietaryFat:", { rawSamples: samples.length, aggregatedDays: byDay.length });
    return byDay;
  } catch (err) {
    logHealthFetchError("readSamples(dietaryFat)", err);
    return [];
  }
}

/**
 * Récupère le taux de masse grasse via readSamples("bodyFat").
 * HealthKit retourne une fraction (0–1) → on convertit en % (*100).
 * Retourne la moyenne journalière (groupByDayAverage).
 */
async function fetchBodyFat(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);
  try {
    const result = await Health.readSamples({
      dataType: "bodyFat" as any,
      startDate,
      endDate,
      limit: 500,
      ascending: true,
    });
    const samples: HealthSample[] = (result.samples ?? [])
      .map((s: any) => {
        const raw = Number(s.value);
        // HealthKit stocke en fraction (0.18) → convertir en % (18)
        const value = Number.isFinite(raw) && raw > 0 && raw <= 1.5
          ? Math.round(raw * 10000) / 100
          : Math.round(raw * 10) / 10;
        return {
          date:  toLocalDateStr(s.startDate),
          value,
          unit:  "%",
        };
      })
      .filter((s: HealthSample) => Number.isFinite(s.value) && s.value > 0);
    if (DEV) console.log(`[health] fetchBodyFat: ${samples.length} échantillons bruts`);
    return groupByDayAverage(samples);
  } catch (err) {
    logHealthFetchError("readSamples(bodyFat)", err);
    return [];
  }
}

async function fetchNativeWorkouts(days: number): Promise<WorkoutData[]> {
  const { startDate, endDate } = isoRange(days);
  try {
    const result = await Health.queryWorkouts({
      startDate,
      endDate,
      limit: 1000,
      ascending: true,
    });
    const types = Array.from(new Set((result.workouts ?? []).map((w) => w.workoutType))).slice(0, 20);
    if (DEV) console.log("[health] queryWorkouts types (sample):", types);
    const workouts = result.workouts ?? [];
    let mapped = 0;
    let unmapped = 0;
    let activeEnergyCount = 0;
    let totalEnergyFallbackCount = 0;
    const out: WorkoutData[] = [];

    for (const w of workouts) {
      const sportType = mapWorkoutType(w.workoutType);
      if (!sportType) {
        unmapped++;
        continue;
      }
      const activeEnergy =
        typeof (w as any).activeEnergyBurned === "number"
          ? Number((w as any).activeEnergyBurned)
          : null;
      const totalEnergy =
        typeof w.totalEnergyBurned === "number"
          ? Number(w.totalEnergyBurned)
          : null;
      // Préférer activeEnergyBurned pour éviter de compter le repos (SMR) dans "sport".
      const workoutCalories = activeEnergy ?? totalEnergy ?? undefined;
      if (activeEnergy != null) activeEnergyCount++;
      else if (totalEnergy != null) totalEnergyFallbackCount++;
      mapped++;
      out.push({
        startTime: w.startDate,
        date: toLocalDateStr(w.startDate),
        sportType,
        durationSec: Math.round(w.duration),
        calories: workoutCalories,
        distanceMeters: w.totalDistance,
        elevationGain: typeof (w as any).totalElevation === "number" && (w as any).totalElevation > 0
          ? Math.round((w as any).totalElevation)
          : undefined,
        source: w.sourceName,
      });
    }

    if (unmapped > 0) {
      if (DEV) console.warn("[health] queryWorkouts unmapped workouts:", { unmapped, mapped, total: workouts.length });
    } else {
      if (DEV) console.log("[health] queryWorkouts mapped workouts:", { mapped, total: workouts.length });
    }
    if (DEV) console.log("[health] queryWorkouts energy source:", {
      activeEnergyCount,
      totalEnergyFallbackCount,
    });

    return out;
  } catch (err) {
    logHealthFetchError("queryWorkouts", err);
    return [];
  }
}

async function fetchNativeHealthData(days: number): Promise<HealthSnapshot> {
  console.group("[health] ── ÉTAPE 2 : Fetch données natives ──");

  const [hrv, weight, restingHR, bodyFat, sleep, workouts, steps, caloriesTotal, protein, carbs, fat] =
    await Promise.allSettled([
      fetchSamples("heartRateVariability", days),
      fetchSamples("weight", days),
      fetchSamples("restingHeartRate", days),
      fetchBodyFat(days),                    // dédié : fraction→%, groupByDayAverage
      fetchNativeSleep(days),
      fetchNativeWorkouts(days),
      fetchDailySteps(days),                 // queryAggregated bucket day sum
      fetchDailyCalories(days),              // dietaryEnergyConsumed agrégé par jour local
      fetchDietaryProtein(days),
      fetchDietaryCarbohydrates(days),
      fetchDietaryFat(days),
    ]);

  const settledEntries = [
    ["heartRateVariability", hrv],
    ["weight", weight],
    ["restingHeartRate", restingHR],
    ["bodyFat", bodyFat],
    ["sleep", sleep],
    ["workouts", workouts],
    ["steps", steps],
    ["caloriesTotal", caloriesTotal],
    ["dietaryProtein", protein],
    ["dietaryCarbohydrates", carbs],
    ["dietaryFat", fat],
  ] as const;
  for (const [name, result] of settledEntries) {
    if (result.status === "rejected") {
      logHealthFetchError(`fetchNativeHealthData:${name}`, result.reason);
    }
  }

  const sleepVal = sleep.status === "fulfilled" ? sleep.value : [];

  const snapshot: HealthSnapshot = {
    hrv:           hrv.status           === "fulfilled" ? hrv.value           : [],
    weight:        weight.status        === "fulfilled" ? weight.value        : [],
    restingHR:     restingHR.status     === "fulfilled" ? restingHR.value     : [],
    bodyFat:       bodyFat.status       === "fulfilled" ? bodyFat.value       : [],
    sleep:         sleepVal,
    workouts:      workouts.status      === "fulfilled" ? workouts.value      : [],
    sleepHours:    [],
    steps:         steps.status         === "fulfilled" ? steps.value         : [],
    caloriesTotal: caloriesTotal.status === "fulfilled" ? caloriesTotal.value : [],
    protein:       protein.status       === "fulfilled" ? protein.value       : [],
    carbohydrates: carbs.status         === "fulfilled" ? carbs.value         : [],
    fat:           fat.status           === "fulfilled" ? fat.value           : [],
  };

  if (DEV) console.log("[health] ✓ Snapshot :", {
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
    carbohydrates: snapshot.carbohydrates.length,
    fat:           snapshot.fat.length,
  });
  console.groupEnd();
  return snapshot;
}

// ─── Données démo (browser uniquement) ────────────────────────────────────────

function generateDemoData(days: number): HealthSnapshot {
  const samples = (base: number, variance: number, unit: string): HealthSample[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date:  toLocalDateStr(d.toISOString()),
        value: Math.round((base + (Math.random() - 0.5) * variance) * 10) / 10,
        unit,
      };
    });

  const dailySamples = (genValue: () => number, unit: string): HealthSample[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return { date: toLocalDateStr(d.toISOString()), value: genValue(), unit };
    });

  const sleepDemo: SleepSample[] = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date:        toLocalDateStr(d.toISOString()),
      state:       "asleep",
      durationMin: Math.round(390 + Math.random() * 150), // ~6.5h–9h
    };
  });

  return {
    hrv:           samples(55, 12, "millisecond"),
    weight:        samples(75, 2,  "kilogram"),
    restingHR:     samples(52, 8,  "bpm"),
    bodyFat:       samples(18, 3,  "percent"),
    sleep:         sleepDemo,
    workouts:      [],
    sleepHours:    [],
    steps:         dailySamples(() => Math.round(6000 + Math.random() * 9000), "count"),
    caloriesTotal: dailySamples(() => Math.round(2800 + Math.random() * 800), "kcal"),
    protein:       dailySamples(() => Math.round(140 + Math.random() * 60), "g"),
    carbohydrates: dailySamples(() => Math.round(180 + Math.random() * 90), "g"),
    fat:           dailySamples(() => Math.round(55 + Math.random() * 35), "g"),
  };
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function fetchHealthData(days = 30): Promise<HealthSnapshot> {
  if (getPlatform() === "ios") {
    return fetchNativeHealthData(days);
  }
  console.info("[health] Browser → données démo (", days, "j)");
  return generateDemoData(days);
}

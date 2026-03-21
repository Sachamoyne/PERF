/**
 * HealthKit Bridge — @capgo/capacitor-health v8
 *
 * Valid HealthDataType values (from plugin definitions):
 *   'steps' | 'distance' | 'calories' | 'heartRate' | 'weight' | 'sleep' |
 *   'respiratoryRate' | 'oxygenSaturation' | 'restingHeartRate' |
 *   'heartRateVariability' | 'bloodPressure' | 'bloodGlucose' |
 *   'bodyTemperature' | 'height' | 'flightsClimbed' | 'exerciseTime' |
 *   'distanceCycling' | 'bodyFat' | 'basalCalories' | 'totalCalories' |
 *   'mindfulness'
 *
 * NOTE: "workout", "activeEnergyBurned", "bodyFatPercentage", "leanBodyMass",
 *       "bmi", "vo2max", "dietaryEnergy" are NOT valid types → they crash the
 *       native bridge and land in catch → "Impossible de demander l'autorisation".
 *       Workouts are fetched via Health.queryWorkouts() separately.
 */

import { Health } from "@capgo/capacitor-health";
import type { Workout } from "@capgo/capacitor-health/dist/esm/definitions";
import { NutritionPlugin } from "@/plugins/nutritionPlugin";

export function toLocalDateStr(isoString: string): string {
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Diagnostic au chargement ────────────────────────────────────────────────
if (!Health) {
  console.error(
    "[health] PLUGIN_NOT_FOUND — Health est falsy au chargement du module.\n" +
    "→ Vérifier que @capgo/capacitor-health est listé dans package.json et installé.\n" +
    "→ Relancer : npm install && npx cap sync && Clean Build Folder dans Xcode."
  );
} else {
  console.log("[health] ✓ Health plugin chargé");
  console.log("[health] Plugin Object Keys     :", Object.keys(Health));
  console.log("[health] window.Capacitor.Plugins.Health :", (window as any).Capacitor?.Plugins?.Health ?? "(non encore injecté)");
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
  caloriesTotal: HealthSample[];   // calories totales journalières (kcal)
  protein:       HealthSample[];   // protéines journalières (g)
}

export interface HealthPermissionResult {
  ok: boolean;
  denied?: boolean; // true si l'utilisateur a explicitement refusé dans iOS
  reason?: string;
  granted?: string[];
  deniedTypes?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    console.log("[health] → Health.isAvailable()...");
    const availability = await Health.isAvailable();
    console.log("[health] ← isAvailable :", JSON.stringify(availability));

    if (!availability.available) {
      const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
      const reason = ua.includes("simulator")
        ? "Apple Santé n'est pas disponible sur le simulateur iOS. Lance l'app sur un iPhone physique."
        : "Apple Santé n'est pas disponible sur cet appareil.";
      console.error("[health] HealthKit indisponible :", availability.reason ?? availability.platform);
      console.groupEnd();
      return { ok: false, reason };
    }

    // IMPORTANT : seuls les types valides de HealthDataType sont listés ici.
    // "workout" n'est PAS un HealthDataType — les workouts passent par queryWorkouts().
    // Les types invalides (vo2max, bmi, leanBodyMass...) provoquent une exception native.
    // Certains builds du plugin demandent une autorisation explicite pour les workouts.
    // On tente d'inclure "workout(s)" dans la liste, et on fallback si le plugin rejette le type.
    // Uniquement les HealthDataType valides du plugin @capgo/capacitor-health v8.
    // Ne jamais ajouter un type absent de cette liste → crash bridge natif.
    const baseRead = [
      "heartRateVariability",
      "weight",
      "sleep",
      "steps",
      "calories",
      "totalCalories",
      "basalCalories",
      "bodyFat",
      "restingHeartRate",
    ];

    const tryReadLists: string[][] = [
      [...baseRead, "workouts"],
      [...baseRead, "workout"],
      baseRead,
    ];

    let status: any | null = null;
    let lastErr: any = null;

    for (const read of tryReadLists) {
      try {
        console.log("[health] → Health.requestAuthorization(read:", read.join(", "), ")");
        // eslint-disable-next-line no-await-in-loop
        status = await Health.requestAuthorization({ read: read as any, write: [] });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        console.warn("[health] requestAuthorization failed for read list, retrying:", read, e);
      }
    }

    if (!status) {
      throw lastErr ?? new Error("requestAuthorization failed");
    }
    console.log("[health] ← requestAuthorization :", JSON.stringify(status));

    const granted = status.readAuthorized ?? [];
    const denied  = status.readDenied    ?? [];

    if (granted.length === 0 && denied.length > 0) {
      console.warn("[health] Tous les types refusés explicitement");
      console.groupEnd();
      return {
        ok: false,
        reason: "Accès Apple Santé refusé. Va dans Réglages > Santé > Accès des apps > Athletes Ascent pour autoriser.",
      };
    }

    // Si notDetermined ou partiellement granted → continuer quand même
    console.log("[health] Continuer malgré granted partiel:", granted, "denied:", denied);
    console.groupEnd();
    return { ok: true, granted, deniedTypes: denied };

  } catch (err) {
    console.error("[health] Exception requestHealthPermissions :", err);
    console.groupEnd();
    return {
      ok: false,
      reason: "Impossible de demander l'autorisation Apple Santé. Vérifie la config iOS (Info.plist, entitlement HealthKit) et relance sur iPhone physique.",
    };
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
    console.error(`[health] ÉCHEC readSamples(${dataType}) :`, err);
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
    console.error("[health] ÉCHEC readSamples(sleep) :", err);
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
    console.log(`[health] fetchDailySteps: ${samples.length} jours`);
    return samples;
  } catch (err) {
    console.error("[health] ÉCHEC queryAggregated(steps) :", err);
    return [];
  }
}

/**
 * Récupère les calories totales journalières via queryAggregated.
 * Essaie d'abord "totalCalories" (actives + basales combinées).
 * Fallback : "calories" (actives) + "basalCalories" agrégés séparément puis sommés par jour.
 */
async function fetchDailyCalories(days: number): Promise<HealthSample[]> {
  const { startDate, endDate } = isoRange(days);

  const aggDay = async (dataType: string): Promise<HealthSample[]> => {
    try {
      const result = await (Health as any).queryAggregated({
        dataType,
        startDate,
        endDate,
        bucket: "day",
        aggregation: "sum",
      });
      return (result.samples ?? [])
        .map((s: any) => ({
          date:  toLocalDateStr(s.startDate),
          value: Math.round(Number(s.value)),
          unit:  "kcal",
        }))
        .filter((s: HealthSample) => Number.isFinite(s.value) && s.value > 0);
    } catch (err) {
      console.error(`[health] ÉCHEC queryAggregated(${dataType}) :`, err);
      return [];
    }
  };

  let samples = await aggDay("totalCalories");

  if (samples.length === 0) {
    const [active, basal] = await Promise.all([aggDay("calories"), aggDay("basalCalories")]);
    console.log(`[health] fetchDailyCalories fallback: actives=${active.length}, basal=${basal.length}`);
    // Additionner actives + basal par jour
    samples = groupByDaySum([...active, ...basal]).map((s) => ({ ...s, unit: "kcal" }));
  }

  if (samples.length === 0) {
    console.log("[health] fetchDailyCalories: aucune donnée disponible");
    return [];
  }
  console.log(`[health] fetchDailyCalories: ${samples.length} jours`);
  return samples;
}

async function fetchDietaryProtein(days: number): Promise<HealthSample[]> {
  if (getPlatform() !== "ios") return [];
  try {
    await NutritionPlugin.requestAuthorization();
    const result = await NutritionPlugin.queryDietaryProtein({ days });
    const samples = (result.samples ?? [])
      .map((s) => ({
        date: toLocalDateStr(s.startDate),
        value: Number(s.value),
        unit: "g" as string,
      }))
      .filter((s) => Number.isFinite(s.value) && s.value > 0);
    console.log("[health] fetchDietaryProtein:", samples.length, "samples");
    return groupByDaySum(samples);
  } catch (err) {
    console.error("[health] fetchDietaryProtein error:", err);
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
    console.log(`[health] fetchBodyFat: ${samples.length} échantillons bruts`);
    return groupByDayAverage(samples);
  } catch (err) {
    console.error("[health] ÉCHEC readSamples(bodyFat) :", err);
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
    console.log("[health] queryWorkouts types (sample):", types);
    const workouts = result.workouts ?? [];
    let mapped = 0;
    let unmapped = 0;
    const out: WorkoutData[] = [];

    for (const w of workouts) {
      const sportType = mapWorkoutType(w.workoutType);
      if (!sportType) {
        unmapped++;
        continue;
      }
      mapped++;
      out.push({
        startTime: w.startDate,
        date: toLocalDateStr(w.startDate),
        sportType,
        durationSec: Math.round(w.duration),
        calories: w.totalEnergyBurned,
        distanceMeters: w.totalDistance,
        elevationGain: typeof (w as any).totalElevation === "number" && (w as any).totalElevation > 0
          ? Math.round((w as any).totalElevation)
          : undefined,
        source: w.sourceName,
      });
    }

    if (unmapped > 0) {
      console.warn("[health] queryWorkouts unmapped workouts:", { unmapped, mapped, total: workouts.length });
    } else {
      console.log("[health] queryWorkouts mapped workouts:", { mapped, total: workouts.length });
    }

    return out;
  } catch (err) {
    console.error("[health] ÉCHEC queryWorkouts :", err);
    return [];
  }
}

async function fetchNativeHealthData(days: number): Promise<HealthSnapshot> {
  console.group("[health] ── ÉTAPE 2 : Fetch données natives ──");

  const [hrv, weight, restingHR, bodyFat, sleep, workouts, steps, caloriesTotal, protein] =
    await Promise.allSettled([
      fetchSamples("heartRateVariability", days),
      fetchSamples("weight", days),
      fetchSamples("restingHeartRate", days),
      fetchBodyFat(days),                    // dédié : fraction→%, groupByDayAverage
      fetchNativeSleep(days),
      fetchNativeWorkouts(days),
      fetchDailySteps(days),                 // queryAggregated bucket day sum
      fetchDailyCalories(days),              // queryAggregated bucket day sum
      fetchDietaryProtein(days),
    ]);

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
  };

  console.log("[health] ✓ Snapshot :", {
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

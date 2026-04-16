import { createClient } from "@supabase/supabase-js";
import { Health } from "@capgo/capacitor-health";
import type { Workout } from "@capgo/capacitor-health/dist/esm/definitions";
import type { Database, TablesInsert } from "@/integrations/supabase/types";
import { toLocalDateStr } from "@/services/health";
import { isIphoneSourceDevice } from "@/lib/platform";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type SyncResult = {
  recordsImported: number;
  activitiesInserted: number;
  sessionsInserted: number;
  activitiesSkippedWindowDuplicate: number;
};

const WORKOUT_READ_TYPES = ["exerciseTime", "calories", "distance", "steps", "workouts"] as const;
const WORKOUT_READ_TYPES_FALLBACK = ["exerciseTime", "calories", "distance", "steps"] as const;

function mapWorkoutTypeToName(workoutType: string): string {
  const normalized = (workoutType ?? "")
    .replace("HKWorkoutActivityType", "")
    .replace(/[^A-Za-z]/g, "")
    .toLowerCase();

  if (normalized.includes("run") || normalized.includes("jog") || normalized.includes("track")) return "running";
  if (normalized.includes("cycle") || normalized.includes("bike")) return "cycling";
  if (normalized.includes("swim")) return "swimming";
  if (normalized.includes("strength") || normalized.includes("weight") || normalized.includes("cross") || normalized.includes("hiit")) return "strength";
  if (normalized.includes("tennis")) return "tennis";
  if (normalized.includes("padel") || normalized.includes("paddle") || normalized.includes("racquet") || normalized.includes("squash")) return "padel";

  return normalized || "workout";
}

function mapWorkoutTypeToSportType(workoutType: string): Database["public"]["Enums"]["sport_type"] | null {
  const name = mapWorkoutTypeToName(workoutType);
  if (name === "running") return "running";
  if (name === "cycling") return "cycling";
  if (name === "swimming") return "swimming";
  if (name === "strength") return "strength";
  if (name === "tennis") return "tennis";
  if (name === "padel") return "padel";
  return null;
}

function buildSessionNotes(workout: Workout): string {
  const durationSec = Math.max(0, Math.round(Number(workout.duration ?? 0)));
  const durationMin = Math.round(durationSec / 60);
  const workoutWithActive = workout as Workout & { activeEnergyBurned?: number };
  const caloriesRaw = typeof workoutWithActive.activeEnergyBurned === "number"
    ? Number(workoutWithActive.activeEnergyBurned)
    : typeof workout.totalEnergyBurned === "number"
      ? Number(workout.totalEnergyBurned)
      : null;

  if (caloriesRaw == null) {
    return `Durée: ${durationMin} min`;
  }

  return `Durée: ${durationMin} min • Calories: ${Math.round(caloriesRaw)} kcal`;
}

async function getAuthedClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase env vars manquantes");
  }

  const baseClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storage: localStorage },
  });

  const { data: { session }, error } = await baseClient.auth.getSession();
  if (error) throw error;

  const token = session?.access_token;
  const userId = session?.user?.id;
  if (!token || !userId) throw new Error("Session utilisateur introuvable");

  const authedClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { client: authedClient, userId };
}

async function queryHealthKitWorkoutsLast30Days(): Promise<Workout[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 30);

  const result = await Health.queryWorkouts({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    limit: 1000,
    ascending: true,
  });

  return result.workouts ?? [];
}

async function ensureWorkoutAuthorization() {
  try {
    await Health.requestAuthorization({
      read: [...WORKOUT_READ_TYPES] as unknown as Parameters<typeof Health.requestAuthorization>[0]["read"],
      write: [],
    });
  } catch {
    // Some plugin versions may reject unknown "workouts" key.
    await Health.requestAuthorization({
      read: [...WORKOUT_READ_TYPES_FALLBACK],
      write: [],
    });
  }

  const check = await Health.checkAuthorization({
    read: [...WORKOUT_READ_TYPES_FALLBACK],
  });

  const readAuthorized: string[] = check?.readAuthorized ?? [];
  const hasWorkoutsEquivalent =
    readAuthorized.includes("workouts") ||
    readAuthorized.includes("exerciseTime");

  if (!hasWorkoutsEquivalent) {
    throw new Error(`Authorization not determined: ${readAuthorized.join(",") || "none"}`);
  }
}

export async function syncHealthKitToSupabase(): Promise<SyncResult> {
  if (!isIphoneSourceDevice()) {
    return { recordsImported: 0, activitiesInserted: 0, sessionsInserted: 0, activitiesSkippedWindowDuplicate: 0 };
  }

  const { client, userId } = await getAuthedClient();
  let activitiesInserted = 0;
  let sessionsInserted = 0;
  let activitiesSkippedWindowDuplicate = 0;

  try {
    await ensureWorkoutAuthorization();
    const workouts = await queryHealthKitWorkoutsLast30Days();

    const since = new Date();
    since.setDate(since.getDate() - 30);
    const sinceDate = toLocalDateStr(since.toISOString());

    const { data: existingSessions, error: existingErr } = await client
      .from("workout_sessions")
      .select("date,name")
      .eq("user_id", userId)
      .gte("date", sinceDate);

    if (existingErr) throw existingErr;

    const existingKeys = new Set(
      (existingSessions ?? []).map((session) => `${session.date}|${(session.name ?? "").toLowerCase()}`)
    );

    const sessionsToInsert: TablesInsert<"workout_sessions">[] = [];

    for (const workout of workouts) {
      const mappedSportType = mapWorkoutTypeToSportType(workout.workoutType);
      if (mappedSportType) {
        const workoutDate = new Date(workout.startDate)
          .toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

        const { data: existingSameDay, error: existingSameDayErr } = await client
          .from("activities")
          .select("id")
          .eq("user_id", userId)
          .eq("sport_type", mappedSportType)
          .gte("start_time", `${workoutDate}T00:00:00+02:00`)
          .lte("start_time", `${workoutDate}T23:59:59+02:00`)
          .limit(1);

        if (existingSameDayErr) throw existingSameDayErr;

        if ((existingSameDay ?? []).length > 0) {
          activitiesSkippedWindowDuplicate++;
        } else {
          const workoutWithActive = workout as Workout & { activeEnergyBurned?: number };
          const caloriesRaw = typeof workoutWithActive.activeEnergyBurned === "number"
            ? Number(workoutWithActive.activeEnergyBurned)
            : typeof workout.totalEnergyBurned === "number"
              ? Number(workout.totalEnergyBurned)
              : null;

          const activityPayload: TablesInsert<"activities"> = {
            user_id: userId,
            sport_type: mappedSportType,
            start_time: workout.startDate,
            duration_sec: Math.max(0, Math.round(Number(workout.duration ?? 0))),
            calories: caloriesRaw != null ? Math.round(caloriesRaw) : null,
            distance_meters: typeof workout.totalDistance === "number" ? Number(workout.totalDistance) : null,
          };

          const { error: insertActivityErr } = await client
            .from("activities")
            .insert(activityPayload);

          if (insertActivityErr) throw insertActivityErr;
          activitiesInserted++;
        }
      }

      const date = toLocalDateStr(workout.startDate);
      const name = mapWorkoutTypeToName(workout.workoutType);
      const key = `${date}|${name.toLowerCase()}`;

      if (existingKeys.has(key)) continue;

      sessionsToInsert.push({
        user_id: userId,
        date,
        name,
        notes: buildSessionNotes(workout),
      });
      existingKeys.add(key);
    }

    if (sessionsToInsert.length > 0) {
      const { data: inserted, error: insertErr } = await client
        .from("workout_sessions")
        .insert(sessionsToInsert)
        .select("id");
      if (insertErr) throw insertErr;
      sessionsInserted = inserted?.length ?? 0;
    }

    const recordsImported = activitiesInserted + sessionsInserted;

    await client.from("sync_logs").insert({
      user_id: userId,
      source: "healthkit",
      status: "success",
      records_imported: recordsImported,
      payload: {
        workouts_read: workouts.length,
        activities_inserted: activitiesInserted,
        activities_skipped_window_duplicate: activitiesSkippedWindowDuplicate,
        sessions_inserted: sessionsInserted,
      },
    });

    return { recordsImported, activitiesInserted, sessionsInserted, activitiesSkippedWindowDuplicate };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown healthkit sync error";

    await client.from("sync_logs").insert({
      user_id: userId,
      source: "healthkit",
      status: "error",
      records_imported: activitiesInserted + sessionsInserted,
      error_message: message,
      payload: {
        activities_inserted: activitiesInserted,
        activities_skipped_window_duplicate: activitiesSkippedWindowDuplicate,
        sessions_inserted: sessionsInserted,
      },
    });

    throw error;
  }
}

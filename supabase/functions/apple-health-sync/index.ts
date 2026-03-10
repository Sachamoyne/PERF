import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function detectSport(item: Record<string, unknown>): string | null {
  const raw = (
    (item.type as string) ||
    (item.workoutActivityType as string) ||
    (item.name as string) ||
    ""
  ).toLowerCase().trim();

  if (/tennis/i.test(raw)) return "tennis";
  if (/padel/i.test(raw)) return "padel";
  if (/running|course|run|trail|jogging/i.test(raw)) return "running";
  if (/cycling|vélo|bik/i.test(raw)) return "cycling";
  if (/swim|natation/i.test(raw)) return "swimming";
  if (/strength|musculation|functional.*strength|renforcement|weight.*training|hiit/i.test(raw)) return "strength";
  return null;
}

function extractDuration(item: Record<string, unknown>): number {
  if (typeof item.duration === "number") return item.duration;
  if (typeof item.duration_sec === "number") return item.duration_sec;
  if (typeof item.durationInSeconds === "number") return item.durationInSeconds;
  if (typeof item.duration_min === "number") return item.duration_min * 60;
  // Apple Health: start/end dates
  if (item.startDate && item.endDate) {
    const diff = (new Date(item.endDate as string).getTime() - new Date(item.startDate as string).getTime()) / 1000;
    if (diff > 0) return Math.round(diff);
  }
  if (typeof item.duration === "string") {
    const parts = (item.duration as string).split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return 0;
}

function extractAvgHr(item: Record<string, unknown>): number | null {
  const v = item.avg_hr ?? item.averageHeartRate ?? item.average_heart_rate ?? item.averageHeartRateInBeatsPerMinute ?? item.fc_moyenne ?? null;
  return typeof v === "number" ? Math.round(v) : null;
}

function extractDistance(item: Record<string, unknown>): number | null {
  if (typeof item.totalDistance === "number") return item.totalDistance;
  if (typeof item.distance_meters === "number") return item.distance_meters;
  if (typeof item.distance === "number") return item.distance;
  if (typeof item.distanceInMeters === "number") return item.distanceInMeters;
  if (typeof item.distance_km === "number") return item.distance_km * 1000;
  return null;
}

function extractSleepHours(item: Record<string, unknown>): number | null {
  // Apple Health sleep: InBedStart / InBedEnd
  if (item.InBedStart && item.InBedEnd) {
    const diff = (new Date(item.InBedEnd as string).getTime() - new Date(item.InBedStart as string).getTime()) / 1000 / 3600;
    if (diff > 0 && diff < 24) return Math.round(diff * 10) / 10;
  }
  if (typeof item.sleep_duration_min === "number") return Math.round((item.sleep_duration_min as number) / 60 * 10) / 10;
  if (typeof item.sleep_minutes === "number") return Math.round((item.sleep_minutes as number) / 60 * 10) / 10;
  return null;
}

function extractHrvSdnn(item: Record<string, unknown>): number | null {
  const hrvObj = item.heart_rate_variability as Record<string, unknown> | undefined;
  const v = item.hrv ?? item.sdnn ?? item.heart_rate_variability_sdnn ?? item.vrc ?? hrvObj?.sdnn ?? hrvObj?.SDNN ?? null;
  return typeof v === "number" && v > 0 ? Math.round(v * 10) / 10 : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Auth via x-api-key header
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing x-api-key header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up user by api_key
    const { data: profile, error: profileErr } = await serviceClient
      .from("profiles")
      .select("user_id")
      .eq("api_key", apiKey)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = profile.user_id;

    // Create a client scoped to the user for RLS
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    // We use service client for inserts since the request comes from iOS (no JWT)
    const db = serviceClient;

    const body = await req.json();
    const workouts = Array.isArray(body.workouts) ? body.workouts : [];
    const metrics = Array.isArray(body.metrics) ? body.metrics : [];

    let activitiesImported = 0;
    let metricsImported = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];

    // --- WORKOUTS ---
    for (const item of workouts as Record<string, unknown>[]) {
      const sportType = detectSport(item);
      if (!sportType) {
        errors.push(`Sport inconnu: "${item.type || item.workoutActivityType || item.name || "?"}"`);
        continue;
      }

      const startTime = (item.startDate || item.start_time || item.date || new Date().toISOString()) as string;
      const durationSec = extractDuration(item);
      const distanceMeters = extractDistance(item);
      const avgHr = extractAvgHr(item);
      let elevationGain = item.totalElevationGain ?? item.total_elevation_gain ?? item.elevation_gain ?? null;
      if (typeof elevationGain !== "number") elevationGain = null;

      // Dedup
      const { data: existing } = await db
        .from("activities")
        .select("id")
        .eq("user_id", userId)
        .eq("sport_type", sportType)
        .eq("start_time", startTime)
        .limit(1);

      if (existing && existing.length > 0) {
        duplicatesSkipped++;
        continue;
      }

      const { error } = await db.from("activities").insert({
        user_id: userId,
        sport_type: sportType,
        start_time: startTime,
        duration_sec: Math.round(durationSec),
        calories: typeof item.totalEnergyBurned === "number" ? Math.round(item.totalEnergyBurned as number) : (typeof item.calories === "number" ? Math.round(item.calories as number) : null),
        avg_hr: avgHr,
        distance_meters: distanceMeters,
        total_elevation_gain: elevationGain as number | null,
      });

      if (error) errors.push(`Activité (${sportType}): ${error.message}`);
      else activitiesImported++;
    }

    // --- METRICS ---
    for (const item of metrics as Record<string, unknown>[]) {
      const date = ((item.date || item.calendarDate || new Date().toISOString().split("T")[0]) as string);
      const toInsert: { metric_type: string; value: number; unit: string }[] = [];

      // HRV SDNN
      const hrv = extractHrvSdnn(item);
      if (hrv) toInsert.push({ metric_type: "hrv", value: hrv, unit: "ms" });

      // Sleep
      const sleepH = extractSleepHours(item);
      if (sleepH) toInsert.push({ metric_type: "sleep_score", value: sleepH, unit: "h" });

      // RHR
      const rhr = item.restingHeartRate ?? item.resting_heart_rate ?? item.rhr ?? null;
      if (typeof rhr === "number" && rhr > 0) toInsert.push({ metric_type: "rhr", value: Math.round(rhr), unit: "bpm" });

      // VO2max
      const vo2 = item.vo2max ?? item.vo2_max ?? item.vo2Max ?? null;
      if (typeof vo2 === "number" && vo2 > 0) toInsert.push({ metric_type: "vo2max", value: Math.round(vo2 * 10) / 10, unit: "ml/kg/min" });

      // Body battery
      const bb = item.body_battery ?? null;
      if (typeof bb === "number" && bb > 0) toInsert.push({ metric_type: "body_battery", value: Math.round(bb), unit: "%" });

      for (const metric of toInsert) {
        const { data: existing } = await db
          .from("health_metrics")
          .select("id")
          .eq("user_id", userId)
          .eq("date", date)
          .eq("metric_type", metric.metric_type)
          .limit(1);

        if (existing && existing.length > 0) {
          duplicatesSkipped++;
          continue;
        }

        const { error } = await db.from("health_metrics").insert({
          user_id: userId,
          date,
          metric_type: metric.metric_type,
          value: metric.value,
          unit: metric.unit,
        });
        if (error) errors.push(`Métrique ${metric.metric_type}: ${error.message}`);
        else metricsImported++;
      }
    }

    // Update last_sync
    await db.from("profiles").update({ last_sync: new Date().toISOString() }).eq("user_id", userId);

    // Log sync
    await db.from("sync_logs").insert({
      user_id: userId,
      source: "apple_health_sync",
      status: errors.length === 0 ? "success" : (activitiesImported + metricsImported) > 0 ? "partial" : "error",
      records_imported: activitiesImported + metricsImported,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      payload: {
        workouts_count: workouts.length,
        metrics_count: metrics.length,
        duplicates_skipped: duplicatesSkipped,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        activities_imported: activitiesImported,
        metrics_imported: metricsImported,
        duplicates_skipped: duplicatesSkipped,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

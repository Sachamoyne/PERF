import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Flexible sport detection: checks name/type fields for keywords
function detectSport(item: Record<string, unknown>): string | null {
  const raw = (
    (item.sport_type as string) ||
    (item.type as string) ||
    (item.activity_type as string) ||
    (item.name as string) ||
    (item.activityName as string) ||
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

// Extract duration in seconds from various formats
function extractDuration(item: Record<string, unknown>): number {
  if (typeof item.duration_sec === "number") return item.duration_sec;
  if (typeof item.duration === "number") return item.duration;
  if (typeof item.durationInSeconds === "number") return item.durationInSeconds;
  // Apple Health sometimes sends duration in minutes
  if (typeof item.duration_min === "number") return item.duration_min * 60;
  // String format "HH:MM:SS"
  if (typeof item.duration === "string") {
    const parts = (item.duration as string).split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return 0;
}

function extractAvgHr(item: Record<string, unknown>): number | null {
  const v = item.avg_hr ?? item.average_heart_rate ?? item.averageHeartRateInBeatsPerMinute ?? item.fc_moyenne ?? null;
  return typeof v === "number" ? Math.round(v) : null;
}

function extractDistance(item: Record<string, unknown>): number | null {
  if (typeof item.distance_meters === "number") return item.distance_meters;
  if (typeof item.distance === "number") return item.distance;
  if (typeof item.distanceInMeters === "number") return item.distanceInMeters;
  // Apple Health may send km
  if (typeof item.distance_km === "number") return item.distance_km * 1000;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { activities, metrics } = body;

    let activitiesImported = 0;
    let metricsImported = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];

    // --- ACTIVITIES ---
    if (Array.isArray(activities)) {
      for (const item of activities) {
        const sportType = detectSport(item);
        if (!sportType) {
          errors.push(`Sport inconnu: "${item.sport_type || item.type || item.activity_type || item.name || "?"}"`);
          continue;
        }

        const startTime = item.start_time || item.date || item.startDate || item.startTimeLocal || new Date().toISOString();
        const durationSec = extractDuration(item);
        const distanceMeters = extractDistance(item);
        const avgHr = extractAvgHr(item);

        // Deduplicate by start_time + sport_type for same user
        const { data: existing } = await supabase
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

        // Calculate pace for running (stored as metadata, but we keep raw data)
        let elevationGain = item.total_elevation_gain ?? item.elevation_gain ?? item.elevationGainInMeters ?? null;
        if (typeof elevationGain !== "number") elevationGain = null;

        const { error } = await supabase.from("activities").insert({
          user_id: userId,
          sport_type: sportType,
          start_time: startTime,
          duration_sec: Math.round(durationSec),
          calories: typeof item.calories === "number" ? Math.round(item.calories) : null,
          avg_hr: avgHr,
          distance_meters: distanceMeters,
          total_elevation_gain: elevationGain as number | null,
        });

        if (error) {
          errors.push(`Activité (${sportType}): ${error.message}`);
        } else {
          activitiesImported++;
        }
      }
    }

    // --- HEALTH METRICS ---
    if (Array.isArray(metrics)) {
      const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      for (const item of metrics) {
        const date = item.date || item.calendarDate || new Date().toISOString().split("T")[0];

        const metricsToInsert: { metric_type: string; value: number; unit: string }[] = [];

        // HRV: only keep SDNN value
        const hrvVal = item.hrv ?? item.heart_rate_variability_sdnn ?? item.vrc ?? item.sdnn ?? null;
        // If item has nested HRV object, extract SDNN
        const hrvObj = item.heart_rate_variability as Record<string, unknown> | undefined;
        const hrvSdnn = hrvObj?.sdnn ?? hrvObj?.SDNN ?? hrvVal;
        if (typeof hrvSdnn === "number" && hrvSdnn > 0) {
          metricsToInsert.push({ metric_type: "hrv", value: Math.round(hrvSdnn * 10) / 10, unit: "ms" });
        }

        // Sleep: convert minutes to hours if > 24 (clearly minutes)
        let sleepVal = item.sleep_score ?? item.sleep_quality ?? null;
        const sleepMinutes = item.sleep_duration_min ?? item.sleep_minutes ?? item.sommeil_minutes ?? null;
        if (typeof sleepMinutes === "number") {
          // Store as hours with 1 decimal
          sleepVal = Math.round((sleepMinutes / 60) * 10) / 10;
        }
        if (typeof sleepVal === "number" && sleepVal > 0) {
          metricsToInsert.push({ metric_type: "sleep_score", value: sleepVal, unit: sleepMinutes ? "h" : "score" });
        }

        // Resting Heart Rate
        const rhr = item.resting_heart_rate ?? item.rhr ?? item.restingHeartRateInBeatsPerMinute ?? null;
        if (typeof rhr === "number" && rhr > 0) {
          metricsToInsert.push({ metric_type: "rhr", value: Math.round(rhr), unit: "bpm" });
        }

        // VO2max
        const vo2 = item.vo2max ?? item.vo2_max ?? item.vo2Max ?? null;
        if (typeof vo2 === "number" && vo2 > 0) {
          metricsToInsert.push({ metric_type: "vo2max", value: Math.round(vo2 * 10) / 10, unit: "ml/kg/min" });
        }

        // Body battery
        const bb = item.body_battery ?? item.bodyBatteryChargedValue ?? null;
        if (typeof bb === "number" && bb > 0) {
          metricsToInsert.push({ metric_type: "body_battery", value: Math.round(bb), unit: "%" });
        }

        for (const metric of metricsToInsert) {
          // Deduplicate by date + metric_type
          const { data: existing } = await supabase
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

          const { error } = await supabase.from("health_metrics").insert({
            user_id: userId,
            date,
            metric_type: metric.metric_type,
            value: metric.value,
            unit: metric.unit,
          });
          if (error) {
            errors.push(`Métrique ${metric.metric_type}: ${error.message}`);
          } else {
            metricsImported++;
          }
        }
      }
    }

    // Update last_sync
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await serviceClient.from("profiles").update({ last_sync: new Date().toISOString() }).eq("user_id", userId);

    // Log sync
    await serviceClient.from("sync_logs").insert({
      user_id: userId,
      source: "manual_import",
      status: errors.length === 0 ? "success" : (activitiesImported + metricsImported) > 0 ? "partial" : "error",
      records_imported: activitiesImported + metricsImported,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      payload: {
        activities_count: activities?.length || 0,
        metrics_count: metrics?.length || 0,
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

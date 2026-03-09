import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth: extract user from token or use x-user-id header (for webhook sources)
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;
    }
    // Fallback: trusted webhook with x-user-id (only for service-to-service)
    if (!userId) {
      userId = req.headers.get("x-user-id");
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized: no user identified" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type, data } = body;
    // type: 'activity' (Garmin) or 'daily' (Apple Health)

    let recordsImported = 0;
    const errors: string[] = [];

    if (type === "activity" && Array.isArray(data)) {
      for (const item of data) {
        const sportMap: Record<string, string> = {
          RUNNING: "running", RUN: "running", TRAIL_RUNNING: "running",
          CYCLING: "cycling", BIKING: "cycling",
          SWIMMING: "swimming", LAP_SWIMMING: "swimming", OPEN_WATER_SWIMMING: "swimming",
          TENNIS: "tennis", PADEL: "padel",
          STRENGTH_TRAINING: "strength", WEIGHT_TRAINING: "strength",
        };

        const sportType = sportMap[(item.activity_type || item.sport || "").toUpperCase()] || null;
        if (!sportType) {
          errors.push(`Unknown sport: ${item.activity_type || item.sport}`);
          continue;
        }

        const { error } = await supabase.from("activities").insert({
          user_id: userId,
          sport_type: sportType,
          start_time: item.start_time || item.startTimeInSeconds
            ? new Date((item.startTimeInSeconds || 0) * 1000).toISOString()
            : new Date().toISOString(),
          duration_sec: item.duration_sec || item.durationInSeconds || item.active_durations_data?.activity_seconds || 0,
          calories: item.calories || item.activeKilocalories || null,
          avg_hr: item.avg_hr || item.averageHeartRateInBeatsPerMinute || item.heart_rate_data?.summary?.avg_hr_bpm || null,
          distance_meters: item.distance_meters || item.distanceInMeters || null,
          total_elevation_gain: item.total_elevation_gain || item.elevationGainInMeters || null,
        });

        if (error) {
          errors.push(`Activity insert error: ${error.message}`);
        } else {
          recordsImported++;
        }
      }
    } else if (type === "daily" && Array.isArray(data)) {
      for (const item of data) {
        const metricsToInsert: { metric_type: string; value: number; unit: string }[] = [];

        if (item.heart_rate_variability_sdnn || item.hrv) {
          metricsToInsert.push({ metric_type: "hrv", value: item.heart_rate_variability_sdnn || item.hrv, unit: "ms" });
        }
        if (item.sleep_score || item.sleep_data?.overall_score) {
          metricsToInsert.push({ metric_type: "sleep_score", value: item.sleep_score || item.sleep_data.overall_score, unit: "score" });
        }
        if (item.resting_heart_rate || item.restingHeartRateInBeatsPerMinute) {
          metricsToInsert.push({ metric_type: "rhr", value: item.resting_heart_rate || item.restingHeartRateInBeatsPerMinute, unit: "bpm" });
        }
        if (item.vo2max || item.vo2Max) {
          metricsToInsert.push({ metric_type: "vo2max", value: item.vo2max || item.vo2Max, unit: "ml/kg/min" });
        }
        if (item.body_battery || item.bodyBatteryChargedValue) {
          metricsToInsert.push({ metric_type: "body_battery", value: item.body_battery || item.bodyBatteryChargedValue, unit: "%" });
        }

        const date = item.date || item.calendarDate || new Date().toISOString().split("T")[0];

        for (const metric of metricsToInsert) {
          const { error } = await supabase.from("health_metrics").insert({
            user_id: userId,
            date,
            metric_type: metric.metric_type,
            value: metric.value,
            unit: metric.unit,
          });
          if (error) {
            errors.push(`Metric insert error: ${error.message}`);
          } else {
            recordsImported++;
          }
        }
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid payload: expected { type: 'activity'|'daily', data: [...] }" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update last_sync on profile
    await supabase.from("profiles").update({ last_sync: new Date().toISOString() }).eq("user_id", userId);

    // Log sync
    await supabase.from("sync_logs").insert({
      user_id: userId,
      source: type === "activity" ? "garmin" : "apple_health",
      status: errors.length === 0 ? "success" : recordsImported > 0 ? "partial" : "error",
      records_imported: recordsImported,
      error_message: errors.length > 0 ? errors.join("; ") : null,
      payload: { type, count: data?.length || 0 },
    });

    return new Response(
      JSON.stringify({
        success: true,
        records_imported: recordsImported,
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

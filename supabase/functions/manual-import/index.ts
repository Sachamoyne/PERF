import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPORT_MAP: Record<string, string> = {
  running: "running", course: "running", "course à pied": "running", run: "running", trail: "running",
  cycling: "cycling", vélo: "cycling", biking: "cycling",
  swimming: "swimming", natation: "swimming",
  tennis: "tennis",
  padel: "padel",
  strength: "strength", musculation: "strength", "strength training": "strength", renforcement: "strength",
};

const METRIC_MAP: Record<string, { metric_type: string; unit: string }> = {
  hrv: { metric_type: "hrv", unit: "ms" },
  heart_rate_variability: { metric_type: "hrv", unit: "ms" },
  heart_rate_variability_sdnn: { metric_type: "hrv", unit: "ms" },
  sleep_score: { metric_type: "sleep_score", unit: "score" },
  sleep_quality: { metric_type: "sleep_score", unit: "score" },
  resting_heart_rate: { metric_type: "rhr", unit: "bpm" },
  rhr: { metric_type: "rhr", unit: "bpm" },
  vo2max: { metric_type: "vo2max", unit: "ml/kg/min" },
  vo2_max: { metric_type: "vo2max", unit: "ml/kg/min" },
  body_battery: { metric_type: "body_battery", unit: "%" },
};

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
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { activities, metrics } = body;

    let activitiesImported = 0;
    let metricsImported = 0;
    const errors: string[] = [];

    // Process activities
    if (Array.isArray(activities)) {
      for (const item of activities) {
        const rawSport = (item.sport_type || item.type || item.activity_type || "").toLowerCase().trim();
        const sportType = SPORT_MAP[rawSport];
        if (!sportType) {
          errors.push(`Sport inconnu: "${rawSport}"`);
          continue;
        }

        const startTime = item.start_time || item.date || item.startDate || new Date().toISOString();
        const durationSec = item.duration_sec || item.duration || item.durationInSeconds || 0;

        const { error } = await supabase.from("activities").insert({
          user_id: userId,
          sport_type: sportType,
          start_time: startTime,
          duration_sec: Math.round(durationSec),
          calories: item.calories || null,
          avg_hr: item.avg_hr || item.average_heart_rate || null,
          distance_meters: item.distance_meters || item.distance || null,
          total_elevation_gain: item.total_elevation_gain || item.elevation_gain || null,
        });

        if (error) {
          errors.push(`Activité: ${error.message}`);
        } else {
          activitiesImported++;
        }
      }
    }

    // Process health metrics
    if (Array.isArray(metrics)) {
      for (const item of metrics) {
        const date = item.date || new Date().toISOString().split("T")[0];

        // Each item can have multiple metric fields
        for (const [key, mapping] of Object.entries(METRIC_MAP)) {
          const value = item[key];
          if (value != null && typeof value === "number") {
            const { error } = await supabase.from("health_metrics").insert({
              user_id: userId,
              date,
              metric_type: mapping.metric_type,
              value,
              unit: mapping.unit,
            });
            if (error) {
              errors.push(`Métrique ${key}: ${error.message}`);
            } else {
              metricsImported++;
            }
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
      payload: { activities_count: activities?.length || 0, metrics_count: metrics?.length || 0 },
    });

    return new Response(
      JSON.stringify({
        success: true,
        activities_imported: activitiesImported,
        metrics_imported: metricsImported,
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

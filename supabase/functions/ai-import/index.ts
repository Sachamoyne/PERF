import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ParsedGarminPayload = {
  sport_type: "running" | "cycling" | "swimming" | "strength" | null;
  date: string | null;
  duration_sec: number | null;
  distance_meters: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  calories: number | null;
  avg_pace_sec_per_km: number | null;
  avg_cadence: number | null;
  elevation_gain_m: number | null;
  avg_power_w: number | null;
  ground_contact_ms: number | null;
  vertical_oscillation_cm: number | null;
  training_effect_aerobic: number | null;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function normalizeSportType(input: unknown): ParsedGarminPayload["sport_type"] {
  if (typeof input !== "string") return null;
  const v = input.toLowerCase().trim();
  if (["running", "cycling", "swimming", "strength"].includes(v)) {
    return v as ParsedGarminPayload["sport_type"];
  }
  return null;
}

function parseDateAsStartTime(date: string | null): string {
  if (!date) return new Date().toISOString();
  const match = /^\d{4}-\d{2}-\d{2}$/.test(date);
  if (!match) return new Date().toISOString();
  return `${date}T12:00:00.000Z`;
}

function sanitizeBase64(data: string): string {
  const trimmed = data.trim();
  const prefixMatch = trimmed.match(/^data:[^;]+;base64,(.*)$/i);
  return prefixMatch ? prefixMatch[1] : trimmed;
}

function extractJsonFromText(text: string): ParsedGarminPayload {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(candidate) as Record<string, unknown>;

  return {
    sport_type: normalizeSportType(parsed.sport_type),
    date: typeof parsed.date === "string" ? parsed.date : null,
    duration_sec: safeNumber(parsed.duration_sec),
    distance_meters: safeNumber(parsed.distance_meters),
    avg_hr: safeNumber(parsed.avg_hr),
    max_hr: safeNumber(parsed.max_hr),
    calories: safeNumber(parsed.calories),
    avg_pace_sec_per_km: safeNumber(parsed.avg_pace_sec_per_km),
    avg_cadence: safeNumber(parsed.avg_cadence),
    elevation_gain_m: safeNumber(parsed.elevation_gain_m),
    avg_power_w: safeNumber(parsed.avg_power_w),
    ground_contact_ms: safeNumber(parsed.ground_contact_ms),
    vertical_oscillation_cm: safeNumber(parsed.vertical_oscillation_cm),
    training_effect_aerobic: safeNumber(parsed.training_effect_aerobic),
  };
}

async function callAnthropicVision({
  apiKey,
  image,
  mediaType,
}: {
  apiKey: string;
  image: string;
  mediaType: "image/jpeg" | "image/png";
}): Promise<ParsedGarminPayload> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: image },
            },
            {
              type: "text",
              text: `Tu es un parser de données sportives Garmin.
Analyse cette capture d'écran et extrais UNIQUEMENT un JSON avec ces champs (null si non visible) :
{
  "sport_type": "running"|"cycling"|"swimming"|"strength"|null,
  "date": "YYYY-MM-DD"|null,
  "duration_sec": number|null,
  "distance_meters": number|null,
  "avg_hr": number|null,
  "max_hr": number|null,
  "calories": number|null,
  "avg_pace_sec_per_km": number|null,
  "avg_cadence": number|null,
  "elevation_gain_m": number|null,
  "avg_power_w": number|null,
  "ground_contact_ms": number|null,
  "vertical_oscillation_cm": number|null,
  "training_effect_aerobic": number|null
}
Réponds UNIQUEMENT avec le JSON, sans texte autour.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic error (${response.status}): ${errText}`);
  }

  const payload = await response.json();
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks
    .filter((b: Record<string, unknown>) => b?.type === "text")
    .map((b: Record<string, unknown>) => String(b.text ?? ""))
    .join("\n")
    .trim();

  if (!text) throw new Error("Réponse Anthropic vide");
  return extractJsonFromText(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(500, { error: "Missing Supabase env vars" });
    }
    if (!anthropicKey) {
      return jsonResponse(500, { error: "Missing ANTHROPIC_API_KEY secret" });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Unauthorized" });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return jsonResponse(401, { error: "Unauthorized" });
    }
    const userId = authData.user.id;

    const body = await req.json().catch(() => null);
    const image = typeof body?.image === "string" ? body.image : null;
    const mediaType = body?.media_type;

    if (!image) return jsonResponse(400, { error: "image is required" });
    if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
      return jsonResponse(400, { error: "media_type must be image/jpeg or image/png" });
    }

    const parsed = await callAnthropicVision({
      apiKey: anthropicKey,
      image: sanitizeBase64(image),
      mediaType,
    });

    if (!parsed.sport_type) {
      return jsonResponse(400, { error: "Impossible de détecter le sport_type" });
    }

    const startTime = parseDateAsStartTime(parsed.date);
    const durationSec = parsed.duration_sec && parsed.duration_sec > 0
      ? Math.round(parsed.duration_sec)
      : 0;

    const payload = {
      user_id: userId,
      sport_type: parsed.sport_type,
      start_time: startTime,
      duration_sec: durationSec,
      distance_meters: parsed.distance_meters,
      avg_hr: parsed.avg_hr ? Math.round(parsed.avg_hr) : null,
      calories: parsed.calories ? Math.round(parsed.calories) : null,
      total_elevation_gain: parsed.elevation_gain_m,
    };

    const { data: existingRow } = await supabase
      .from("activities")
      .select("id,duration_sec,distance_meters,avg_hr,calories,total_elevation_gain,sport_type")
      .eq("user_id", userId)
      .eq("start_time", startTime)
      .maybeSingle();

    let persisted: Record<string, unknown> | null = null;

    if (existingRow?.id) {
      const mergedPayload = {
        sport_type: payload.sport_type ?? existingRow.sport_type,
        duration_sec: payload.duration_sec > 0 ? payload.duration_sec : existingRow.duration_sec,
        distance_meters: payload.distance_meters ?? existingRow.distance_meters,
        avg_hr: payload.avg_hr ?? existingRow.avg_hr,
        calories: payload.calories ?? existingRow.calories,
        total_elevation_gain: payload.total_elevation_gain ?? existingRow.total_elevation_gain,
      };

      const { data: updated, error: updateErr } = await supabase
        .from("activities")
        .update(mergedPayload)
        .eq("id", existingRow.id)
        .select("id,user_id,sport_type,start_time,duration_sec,distance_meters,avg_hr,calories,total_elevation_gain")
        .single();

      if (updateErr) throw updateErr;
      persisted = updated as Record<string, unknown>;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("activities")
        .upsert(payload, { onConflict: "user_id,start_time" })
        .select("id,user_id,sport_type,start_time,duration_sec,distance_meters,avg_hr,calories,total_elevation_gain")
        .single();

      if (insertErr) {
        // Fallback if onConflict constraint is absent in DB.
        const { data: fallbackInserted, error: fallbackErr } = await supabase
          .from("activities")
          .insert(payload)
          .select("id,user_id,sport_type,start_time,duration_sec,distance_meters,avg_hr,calories,total_elevation_gain")
          .single();
        if (fallbackErr) throw fallbackErr;
        persisted = fallbackInserted as Record<string, unknown>;
      } else {
        persisted = inserted as Record<string, unknown>;
      }
    }

    return jsonResponse(200, {
      success: true,
      data: {
        ...persisted,
        extracted: parsed,
      },
    });
  } catch (err) {
    return jsonResponse(500, { error: (err as Error).message });
  }
});

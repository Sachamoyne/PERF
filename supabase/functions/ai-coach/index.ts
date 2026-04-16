import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

function jsonResponse(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDuration(durationSec: number | null | undefined): string {
  if (!durationSec || durationSec <= 0) return "n/d";
  const h = Math.floor(durationSec / 3600);
  const m = Math.floor((durationSec % 3600) / 60);
  const s = durationSec % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}m${String(s).padStart(2, "0")}`;
}

function formatDistance(distanceMeters: number | null | undefined): string {
  if (!distanceMeters || distanceMeters <= 0) return "n/d";
  return `${(distanceMeters / 1000).toFixed(2)} km`;
}

function formatPace(durationSec: number | null | undefined, distanceMeters: number | null | undefined): string {
  if (!durationSec || !distanceMeters || distanceMeters <= 0) return "n/d";
  const secPerKm = durationSec / (distanceMeters / 1000);
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "n/d";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] || null;
}

function toDateLabel(input: string | null | undefined): string {
  if (!input) return "n/d";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleDateString("fr-FR");
}

function formatRunningActivities(activities: Array<Record<string, unknown>>): string {
  if (!activities.length) return "- Aucune activité running récente";

  return activities
    .map((activity) => {
      const date = toDateLabel(activity.start_time as string);
      const distance = formatDistance(activity.distance_meters as number | null);
      const duration = formatDuration(activity.duration_sec as number | null);
      const pace = formatPace(activity.duration_sec as number | null, activity.distance_meters as number | null);
      const avgHr = activity.avg_hr ? `${activity.avg_hr} bpm` : "n/d";
      const calories = activity.calories ? `${activity.calories} kcal` : "n/d";

      return `- ${date} | ${distance} | ${duration} | allure ${pace} | FC moy ${avgHr} | ${calories}`;
    })
    .join("\n");
}

function formatWorkoutSessions(
  sessions: Array<Record<string, unknown>>,
  setsBySessionId: Map<string, Array<Record<string, unknown>>>,
): string {
  if (!sessions.length) return "- Aucune séance musculation récente";

  return sessions
    .map((session) => {
      const sessionId = String(session.id);
      const date = toDateLabel(session.date as string);
      const sets = setsBySessionId.get(sessionId) ?? [];

      const grouped = new Map<string, Array<Record<string, unknown>>>();
      for (const set of sets) {
        const exercise = String(set.exercise_name ?? "Exercice");
        if (!grouped.has(exercise)) grouped.set(exercise, []);
        grouped.get(exercise)!.push(set);
      }

      const exercises = Array.from(grouped.entries())
        .slice(0, 8)
        .map(([name, exerciseSets]) => {
          const lines = exerciseSets
            .slice(0, 6)
            .map((set) => `${set.reps ?? "?"}x${set.weight_kg ?? "?"}kg`)
            .join(", ");
          return `${name} (${lines})`;
        })
        .join("; ");

      const sessionName = session.name ? ` ${session.name}` : "";
      return `- ${date}${sessionName} | ${exercises || "détails indisponibles"}`;
    })
    .join("\n");
}

function formatHealthMetrics(metrics: Array<Record<string, unknown>>): string {
  if (!metrics.length) return "- Aucune métrique santé récente";

  return metrics
    .map((m) => `- ${m.metric_type}: ${m.value ?? "n/d"} ${m.unit ?? ""} (${toDateLabel(m.date as string)})`)
    .join("\n");
}

async function callAnthropic({
  apiKey,
  system,
  messages,
}: {
  apiKey: string;
  system: string;
  messages: AnthropicMessage[];
}): Promise<string> {
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
      system,
      messages,
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
  return text;
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
    const rawMessage = body?.message;
    const rawHistory = Array.isArray(body?.history) ? body.history : [];

    if (typeof rawMessage !== "string" || !rawMessage.trim()) {
      return jsonResponse(400, { error: "message is required" });
    }

    const history: ChatMessage[] = rawHistory
      .filter((msg: unknown) => {
        if (!msg || typeof msg !== "object") return false;
        const role = (msg as Record<string, unknown>).role;
        const content = (msg as Record<string, unknown>).content;
        return (role === "user" || role === "assistant") && typeof content === "string";
      })
      .slice(-20) as ChatMessage[];

    const [{ data: profile, error: profileErr }, { data: activities, error: actsErr }, { data: sessions, error: sessionsErr }, { data: metrics, error: metricsErr }] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,sex,age,height_cm,weight_kg,activity_level")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("activities")
        .select("id,sport_type,start_time,duration_sec,distance_meters,avg_hr,calories")
        .eq("user_id", userId)
        .order("start_time", { ascending: false })
        .limit(10),
      supabase
        .from("workout_sessions")
        .select("id,date,name")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(5),
      supabase
        .from("health_metrics")
        .select("metric_type,value,unit,date")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(50),
    ]);

    if (profileErr) throw profileErr;
    if (actsErr) throw actsErr;
    if (sessionsErr) throw sessionsErr;
    if (metricsErr) throw metricsErr;

    const sessionIds = (sessions ?? []).map((s) => s.id as string);
    let allSets: Array<Record<string, unknown>> = [];
    if (sessionIds.length > 0) {
      const { data: sets, error: setsErr } = await supabase
        .from("workout_sets")
        .select("session_id,exercise_name,reps,weight_kg")
        .eq("user_id", userId)
        .in("session_id", sessionIds)
        .order("created_at", { ascending: true });
      if (setsErr) throw setsErr;
      allSets = (sets ?? []) as Array<Record<string, unknown>>;
    }

    const setsBySessionId = new Map<string, Array<Record<string, unknown>>>();
    for (const set of allSets) {
      const sessionId = String(set.session_id);
      if (!setsBySessionId.has(sessionId)) setsBySessionId.set(sessionId, []);
      setsBySessionId.get(sessionId)!.push(set);
    }

    const runningActivities = (activities ?? []).filter((a) => a.sport_type === "running");

    const latestMetricByType = new Map<string, Record<string, unknown>>();
    for (const metric of (metrics ?? []) as Array<Record<string, unknown>>) {
      const type = String(metric.metric_type);
      if (!latestMetricByType.has(type)) latestMetricByType.set(type, metric);
    }

    const latestMetrics = Array.from(latestMetricByType.values());
    const athleteName = firstName(profile?.full_name) ?? "l'athlète";

    const systemPrompt = `Tu es le coach sportif IA de ${athleteName}.
Tu as accès à ses données d'entraînement en temps réel.

PROFIL :
- Sexe : ${profile?.sex ?? "n/d"}, Âge : ${profile?.age ?? "n/d"} ans, Taille : ${profile?.height_cm ?? "n/d"} cm, Poids : ${profile?.weight_kg ?? "n/d"} kg
- Niveau d'activité : ${profile?.activity_level ?? "n/d"}
- Objectif : lean bulk (prise de muscle, minimum de gras)

DERNIÈRES ACTIVITÉS RUNNING (10 dernières) :
${formatRunningActivities(runningActivities as Array<Record<string, unknown>>)}

DERNIÈRES SÉANCES MUSCU (5 dernières) :
${formatWorkoutSessions((sessions ?? []) as Array<Record<string, unknown>>, setsBySessionId)}

DERNIÈRES MÉTRIQUES SANTÉ :
${formatHealthMetrics(latestMetrics)}

Réponds toujours en français. Sois direct, précis, coach sportif de haut niveau. Donne des conseils actionnables basés sur les vraies données ci-dessus. Si tu détectes une progression ou une régression, mentionne-la explicitement.`;

    const anthropicMessages: AnthropicMessage[] = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: rawMessage.trim() },
    ];

    const reply = await callAnthropic({
      apiKey: anthropicKey,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const { error: convErr } = await supabase
      .from("ai_conversations" as never)
      .insert([
        { user_id: userId, role: "user", content: rawMessage.trim() },
        { user_id: userId, role: "assistant", content: reply },
      ] as never);

    if (convErr) {
      console.warn("[ai-coach] failed to persist ai_conversations:", convErr.message);
    }

    return jsonResponse(200, { reply });
  } catch (err) {
    return jsonResponse(500, { error: (err as Error).message });
  }
});

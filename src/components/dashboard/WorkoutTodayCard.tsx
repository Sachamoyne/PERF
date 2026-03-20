import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Timer } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const sportLabels: Record<string, string> = {
  running: "Course",
  cycling: "Vélo",
  swimming: "Natation",
  tennis: "Tennis",
  padel: "Padel",
  strength: "Muscu",
};

const sportColors: Record<string, string> = {
  running: "hsl(25, 95%, 53%)",
  cycling: "hsl(280, 60%, 55%)",
  swimming: "hsl(195, 85%, 50%)",
  tennis: "hsl(48, 96%, 53%)",
  padel: "hsl(340, 82%, 52%)",
  strength: "hsl(262, 83%, 58%)",
};

function useTodayWorkouts() {
  return useQuery({
    queryKey: ["today_workouts"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data: todayData } = await supabase
        .from("activities")
        .select("sport_type, duration_sec, calories, start_time")
        .gte("start_time", `${today}T00:00:00`)
        .lte("start_time", `${today}T23:59:59`);

      if ((todayData ?? []).length > 0) {
        return { mode: "today" as const, workouts: todayData ?? [] };
      }

      const { data: latestData } = await supabase
        .from("activities")
        .select("sport_type, duration_sec, calories, start_time")
        .order("start_time", { ascending: false })
        .limit(1);

      return { mode: "latest" as const, workouts: latestData ?? [] };
    },
  });
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}

export function WorkoutTodayCard() {
  const { data, isLoading } = useTodayWorkouts();
  const mode = data?.mode ?? "today";
  const workouts = data?.workouts ?? [];

  const totalSec = workouts.reduce((s, w) => s + w.duration_sec, 0);
  const totalCal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);
  const latestDate = workouts[0]?.start_time ? new Date(workouts[0].start_time) : null;
  const latestLabel = (() => {
    if (!latestDate) return "";
    const today = new Date();
    const latestDay = latestDate.toISOString().split("T")[0];
    const todayDay = today.toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDay = yesterday.toISOString().split("T")[0];

    if (latestDay === todayDay) return "Aujourd'hui";
    if (latestDay === yesterdayDay) return "Hier";
    return format(latestDate, "d MMM", { locale: fr });
  })();

  return (
    <div className="glass-card p-4 flex flex-col gap-2" style={{ minHeight: "180px" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          <span>Entraînement</span>
        </div>
        {totalCal > 0 && (
          <span className="text-[10px] text-muted-foreground">{totalCal} cal</span>
        )}
      </div>

      {/* Valeur principale */}
      <div className="flex-1 flex flex-col justify-center">
        {isLoading ? (
          <span className="text-xl font-display font-bold text-muted-foreground">—</span>
        ) : workouts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-center">
            <span className="text-2xl font-display font-bold" style={{ color: "hsl(152, 60%, 48%)" }}>0</span>
            <span className="text-[10px] text-muted-foreground">min aujourd'hui</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <span className="text-2xl font-display font-bold" style={{ color: "hsl(152, 60%, 48%)" }}>
                {formatDuration(totalSec)}
              </span>
              {mode === "latest" && (
                <span className="ml-2 text-[10px] text-muted-foreground">{latestLabel}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {workouts.map((w, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    color: sportColors[w.sport_type] ?? "hsl(var(--foreground))",
                    backgroundColor: `${sportColors[w.sport_type] ?? "hsl(var(--secondary))"}22`,
                  }}
                >
                  {sportLabels[w.sport_type] ?? w.sport_type}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nombre de séances */}
      <div className="text-[9px] text-muted-foreground">
        {mode === "today"
          ? `${workouts.length} séance${workouts.length !== 1 ? "s" : ""} aujourd'hui`
          : latestDate
            ? `${latestLabel} — ${formatDuration(totalSec)}`
            : "Aucune séance"}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Timer } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

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

/** Returns UTC ISO boundaries for a Paris local date (handles CET +1 / CEST +2). */
function parisDateToUtcBounds(dateStr: string): { start: string; end: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  // France: UTC+2 (CEST) April–October, UTC+1 (CET) otherwise
  const offsetHours = month >= 4 && month <= 10 ? 2 : 1;
  const startUTC = new Date(Date.UTC(year, month - 1, day, -offsetHours, 0, 0));
  const endUTC = new Date(Date.UTC(year, month - 1, day, 24 - offsetHours, 0, 0) - 1);
  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function useTodayWorkouts(date?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["today_workouts", user?.id, date],
    enabled: !!user,
    staleTime: 0,
    queryFn: async () => {
      if (!user) return { mode: "today" as const, workouts: [] };
      const targetDate = date ?? new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
      const { start, end } = parisDateToUtcBounds(targetDate);
      const { data: todayData } = await supabase
        .from("activities")
        .select("sport_type, duration_sec, calories, start_time")
        .eq("user_id", user.id)
        .gte("start_time", start)
        .lte("start_time", end);

      if ((todayData ?? []).length > 0) {
        return { mode: "today" as const, workouts: todayData ?? [] };
      }

      if (date) {
        return { mode: "today" as const, workouts: [] };
      }

      const { data: latestData } = await supabase
        .from("activities")
        .select("sport_type, duration_sec, calories, start_time")
        .eq("user_id", user.id)
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

export function WorkoutTodayCard({ date, detailPath }: { date?: string; detailPath?: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useTodayWorkouts(date);
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
        <div className="flex items-center gap-1.5 dashboard-card-title">
          <Timer className="h-3.5 w-3.5" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (detailPath) navigate(detailPath);
            }}
            className={`transition-colors ${detailPath ? "cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            Entraînement
          </button>
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
            <span className="dashboard-card-value font-display" style={{ color: "hsl(var(--primary))" }}>0</span>
            <span className="text-[10px] text-muted-foreground">{date ? "min sur la date" : "min aujourd'hui"}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div>
              <span className="dashboard-card-value font-display" style={{ color: "hsl(var(--primary))" }}>
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
          ? `${workouts.length} séance${workouts.length !== 1 ? "s" : ""} ${date ? "sur la date" : "aujourd'hui"}`
          : latestDate
            ? `${latestLabel} — ${formatDuration(totalSec)}`
            : "Aucune séance"}
      </div>
    </div>
  );
}

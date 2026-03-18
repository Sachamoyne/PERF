import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Timer } from "lucide-react";

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
      const { data } = await supabase
        .from("activities")
        .select("sport_type, duration_sec, calories")
        .gte("start_time", `${today}T00:00:00`)
        .lte("start_time", `${today}T23:59:59`);
      return data ?? [];
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
  const { data: workouts = [], isLoading } = useTodayWorkouts();

  const totalSec = workouts.reduce((s, w) => s + w.duration_sec, 0);
  const totalCal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);

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
        {workouts.length} séance{workouts.length !== 1 ? "s" : ""} aujourd'hui
      </div>
    </div>
  );
}

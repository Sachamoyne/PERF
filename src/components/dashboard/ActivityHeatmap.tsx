import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, getDay, getDaysInMonth, subMonths, addMonths, isSameMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface DayData {
  sessions: number;
  totalMinutes: number;
}

function useMonthlyHeatmap(month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  return useQuery({
    queryKey: ["monthly_heatmap", format(start, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("start_time, duration_sec")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());
      if (error) throw error;

      const map: Record<string, DayData> = {};
      data?.forEach((a) => {
        const day = a.start_time.split("T")[0];
        if (!map[day]) map[day] = { sessions: 0, totalMinutes: 0 };
        map[day].sessions++;
        map[day].totalMinutes += Math.round(a.duration_sec / 60);
      });
      return map;
    },
  });
}

export function ActivityHeatmap() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { data: dayData = {} } = useMonthlyHeatmap(currentMonth);

  const now = new Date();
  const canGoNext = !isSameMonth(currentMonth, now);

  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentMonth);
    const firstDay = startOfMonth(currentMonth);
    // getDay: 0=Sun, convert to Mon-based (0=Mon)
    let startOffset = getDay(firstDay) - 1;
    if (startOffset < 0) startOffset = 6;

    const grid: (null | { date: string; day: number })[] = [];
    for (let i = 0; i < startOffset; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d), "yyyy-MM-dd");
      grid.push({ date, day: d });
    }
    return grid;
  }, [currentMonth]);

  const getIntensity = (minutes: number) => {
    if (minutes === 0) return "bg-secondary";
    if (minutes <= 30) return "bg-primary/25";
    if (minutes <= 60) return "bg-primary/50";
    if (minutes <= 120) return "bg-primary/75";
    return "bg-primary";
  };

  const formatMinutes = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
  };

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-foreground">
          Activité d'entraînement
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[100px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: fr })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            disabled={!canGoNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-[10px] text-muted-foreground text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarGrid.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="aspect-square" />;
          }
          const data = dayData[cell.date];
          const sessions = data?.sessions ?? 0;
          const totalMin = data?.totalMinutes ?? 0;

          return (
            <Tooltip key={cell.date}>
              <TooltipTrigger asChild>
                <div
                  className={`aspect-square rounded-md flex items-center justify-center text-[11px] font-medium cursor-default transition-colors ${getIntensity(totalMin)} ${sessions > 0 ? "text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {cell.day}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-medium">{format(new Date(cell.date), "d MMMM yyyy", { locale: fr })}</p>
                {sessions > 0 ? (
                  <p>{sessions} séance{sessions > 1 ? "s" : ""} · {formatMinutes(totalMin)}</p>
                ) : (
                  <p className="text-muted-foreground">Repos</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Repos</span>
        <div className="w-3 h-3 rounded-sm bg-secondary" />
        <div className="w-3 h-3 rounded-sm bg-primary/25" />
        <div className="w-3 h-3 rounded-sm bg-primary/50" />
        <div className="w-3 h-3 rounded-sm bg-primary/75" />
        <div className="w-3 h-3 rounded-sm bg-primary" />
        <span>Intense</span>
      </div>
    </div>
  );
}

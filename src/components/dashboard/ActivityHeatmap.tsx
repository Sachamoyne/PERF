import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, getDay, getDaysInMonth, subMonths, addMonths, isSameMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

function useMonthlyHeatmap(month: Date) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  return useQuery({
    queryKey: ["monthly_heatmap", format(start, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("start_time")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString());
      if (error) throw error;

      const map: Record<string, number> = {};
      data?.forEach((a) => {
        const day = a.start_time.split("T")[0];
        map[day] = (map[day] || 0) + 1;
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

  return (
    <div className="glass-card p-4 space-y-3">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-foreground">
          Régularité
        </h3>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs font-medium text-muted-foreground min-w-[90px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: fr })}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            disabled={!canGoNext}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-[6px]">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="flex items-center justify-center">
            <span className="text-[9px] text-muted-foreground font-medium">{d}</span>
          </div>
        ))}
      </div>

      {/* Dot grid */}
      <div className="grid grid-cols-7 gap-[6px]">
        {calendarGrid.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} className="flex items-center justify-center h-[14px]" />;
          }
          const sessions = dayData[cell.date] ?? 0;
          const active = sessions > 0;

          return (
            <Tooltip key={cell.date}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center h-[14px]">
                  <div
                    className={`w-[10px] h-[10px] rounded-full transition-colors ${active ? "bg-primary" : "bg-secondary"}`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <p className="font-medium">{format(new Date(cell.date), "d MMMM yyyy", { locale: fr })}</p>
                {active ? (
                  <p>{sessions} séance{sessions > 1 ? "s" : ""}</p>
                ) : (
                  <p className="text-muted-foreground">Repos</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useActivities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  format, isAfter, subYears,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Mountain, Wind, TrendingUp, TrendingDown, Clock, Heart, ArrowUp, Footprints } from "lucide-react";
import { computePace } from "@/lib/garmin-utils";

type Period = "week" | "month" | "year";

const periodLabels: Record<Period, string> = { week: "Semaine", month: "Mois", year: "Année" };

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
      {(Object.keys(periodLabels) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === p
              ? "bg-running text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {periodLabels[p]}
        </button>
      ))}
    </div>
  );
}

type ChartEntry = {
  label: string;
  dateLabel: string;
  km: number;
  hasActivity: boolean;
  id: string | null;
};

export default function Running() {
  const { data: allRuns = [] } = useActivities("running");
  const [period, setPeriod] = useState<Period>("month");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setSelectedRunId(null);
  };

  // VO2Max latest
  const { data: vo2Data } = useQuery({
    queryKey: ["vo2max_latest"],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_metrics")
        .select("value, date")
        .eq("metric_type", "vo2max")
        .order("date", { ascending: false })
        .limit(2);
      return data;
    },
  });

  // Period boundaries
  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === "week") {
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    }
    if (period === "month") {
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
    return { start: startOfYear(now), end: endOfYear(now) };
  }, [period]);

  // KPI filtered runs
  const filteredRuns = useMemo(
    () => allRuns.filter((r) => {
      const d = new Date(r.start_time);
      return d >= periodRange.start && d <= periodRange.end;
    }),
    [allRuns, periodRange]
  );

  const totalDist = filteredRuns.reduce((s, r) => s + (r.distance_meters || 0), 0);
  const totalElev = filteredRuns.reduce((s, r) => s + (r.total_elevation_gain || 0), 0);

  const vo2Value = vo2Data?.[0]?.value;
  const vo2Prev = vo2Data?.[1]?.value;
  const vo2Trend = vo2Value && vo2Prev ? vo2Value - vo2Prev : 0;

  // Chart data
  const chartData: ChartEntry[] = useMemo(() => {
    if (period === "year") {
      const months = eachMonthOfInterval({ start: periodRange.start, end: periodRange.end });
      return months.map((month) => {
        const monthRuns = allRuns.filter((r) => {
          const d = new Date(r.start_time);
          return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
        });
        const km = monthRuns.reduce((s, r) => s + (r.distance_meters || 0), 0) / 1000;
        const lastRun = monthRuns.length > 0 ? monthRuns[0] : null;
        return {
          label: format(month, "MMM", { locale: fr }),
          dateLabel: format(month, "MMMM yyyy", { locale: fr }),
          km: Math.round(km * 10) / 10,
          hasActivity: monthRuns.length > 0,
          id: lastRun?.id ?? null,
        };
      });
    }

    const days = eachDayOfInterval({ start: periodRange.start, end: periodRange.end });
    return days.map((day) => {
      const dayRuns = allRuns.filter((r) => {
        const rd = new Date(r.start_time);
        return rd.getFullYear() === day.getFullYear() &&
               rd.getMonth() === day.getMonth() &&
               rd.getDate() === day.getDate();
      });
      const km = dayRuns.reduce((s, r) => s + (r.distance_meters || 0), 0) / 1000;
      return {
        label: period === "week"
          ? format(day, "EEE", { locale: fr })
          : format(day, "d"),
        dateLabel: format(day, "EEEE d MMMM", { locale: fr }),
        km: Math.round(km * 10) / 10,
        hasActivity: dayRuns.length > 0,
        id: dayRuns.length > 0 ? dayRuns[0].id : null,
      };
    });
  }, [allRuns, period, periodRange]);

  // Default to latest run if nothing selected
  const displayRunId = selectedRunId ?? (filteredRuns.length > 0 ? filteredRuns[0].id : null);
  const selectedRun = displayRunId ? allRuns.find((r) => r.id === displayRunId) : null;

  const barMaxSize = period === "week" ? 40 : period === "month" ? 16 : 28;
  const xAxisInterval = period === "month" ? 4 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Running</h1>
        <PeriodSelector value={period} onChange={handlePeriodChange} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-running/15">
            <MapPin className="h-5 w-5 text-running" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">
              {(totalDist / 1000).toFixed(1)} <span className="text-sm font-normal text-muted-foreground">km</span>
            </p>
            <p className="text-xs text-muted-foreground">Distance totale</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-running/15">
            <Mountain className="h-5 w-5 text-running" />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">
              {totalElev.toFixed(0)} <span className="text-sm font-normal text-muted-foreground">m D+</span>
            </p>
            <p className="text-xs text-muted-foreground">Dénivelé total</p>
          </div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-vo2max/15">
            <Wind className="h-5 w-5 text-vo2max" />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-display font-bold text-foreground">
              {vo2Value ?? "—"} <span className="text-sm font-normal text-muted-foreground">ml/kg/min</span>
            </p>
            {vo2Trend !== 0 && (
              <span className={`flex items-center text-xs ${vo2Trend > 0 ? "text-primary" : "text-destructive"}`}>
                {vo2Trend > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                {vo2Trend > 0 ? "+" : ""}{vo2Trend.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          {period === "year" ? "Distance par mois" : "Distance par jour"}
        </h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              onClick={(e) => {
                const payload = e?.activePayload?.[0]?.payload as ChartEntry | undefined;
                if (payload?.hasActivity && payload?.id) {
                  setSelectedRunId(payload.id);
                }
              }}
              barCategoryGap={period === "week" ? "30%" : "20%"}
            >
              <defs>
                <linearGradient id="runGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--running))" stopOpacity={1} />
                  <stop offset="100%" stopColor="hsl(var(--rhr))" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                interval={xAxisInterval}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit=" km" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number) => [value > 0 ? `${value} km` : "Repos", "Distance"]}
                labelFormatter={(_, payload) => {
                  const item = payload?.[0]?.payload as ChartEntry | undefined;
                  return item?.dateLabel ?? "";
                }}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
              />
              <Bar dataKey="km" radius={[3, 3, 0, 0]} cursor="pointer" maxBarSize={barMaxSize}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      !entry.hasActivity
                        ? "hsl(var(--muted))"
                        : entry.id === displayRunId
                          ? "hsl(var(--rhr))"
                          : "url(#runGradient)"
                    }
                    opacity={displayRunId && entry.id !== displayRunId ? 0.4 : entry.hasActivity ? 1 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity detail or empty state */}
      {selectedRun ? (
        <div
          key={selectedRun.id}
          className="glass-card p-5 border-l-4 border-running animate-fade-in"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              Détail — {format(new Date(selectedRun.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
            </h3>
            <button onClick={() => setSelectedRunId(null)} className="text-muted-foreground hover:text-foreground text-sm">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <DetailStat icon={<MapPin className="h-4 w-4 text-running" />} label="Distance" value={`${((selectedRun.distance_meters || 0) / 1000).toFixed(2)} km`} />
            <DetailStat icon={<Clock className="h-4 w-4 text-running" />} label="Durée" value={formatDuration(selectedRun.duration_sec)} />
            <DetailStat icon={<Footprints className="h-4 w-4 text-running" />} label="Allure moy." value={`${computePace(selectedRun.duration_sec, selectedRun.distance_meters || 0)} /km`} />
            <DetailStat icon={<Heart className="h-4 w-4 text-rhr" />} label="FC Moyenne" value={selectedRun.avg_hr ? `${selectedRun.avg_hr} bpm` : "—"} />
            <DetailStat icon={<Mountain className="h-4 w-4 text-running" />} label="Dénivelé" value={`${(selectedRun.total_elevation_gain || 0).toFixed(0)} m`} />
            <DetailStat icon={<ArrowUp className="h-4 w-4 text-muted-foreground" />} label="Calories" value={selectedRun.calories ? `${selectedRun.calories} kcal` : "—"} />
          </div>
        </div>
      ) : (
        <div className="glass-card p-6 flex items-center justify-center text-muted-foreground text-sm animate-fade-in">
          <Footprints className="h-4 w-4 mr-2 opacity-50" />
          Sélectionnez une activité sur le graphique pour voir les détails
        </div>
      )}
    </div>
  );
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

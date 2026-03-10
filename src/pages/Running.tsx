import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useActivities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  format, parseISO, isAfter, subDays, subMonths, subYears,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay,
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

function periodCutoff(period: Period): Date {
  const now = new Date();
  if (period === "week") return subDays(now, 7);
  if (period === "month") return subMonths(now, 1);
  return subYears(now, 1);
}

export default function Running() {
  const { data: allRuns = [] } = useActivities("running");
  const [kpiPeriod, setKpiPeriod] = useState<Period>("month");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("month");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

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

  const cutoff = useMemo(() => periodCutoff(kpiPeriod), [kpiPeriod]);
  const filteredRuns = useMemo(
    () => allRuns.filter((r) => isAfter(parseISO(r.start_time), cutoff)),
    [allRuns, cutoff]
  );

  const totalDist = filteredRuns.reduce((s, r) => s + (r.distance_meters || 0), 0);
  const totalElev = filteredRuns.reduce((s, r) => s + (r.total_elevation_gain || 0), 0);

  const vo2Value = vo2Data?.[0]?.value;
  const vo2Prev = vo2Data?.[1]?.value;
  const vo2Trend = vo2Value && vo2Prev ? vo2Value - vo2Prev : 0;

  // Build calendar-based chart data (every day of the period)
  const chartData = useMemo(() => {
    const now = new Date();
    let days: Date[];
    if (chartPeriod === "week") {
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    } else {
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    }

    return days.map((day) => {
      const dayRuns = allRuns.filter((r) => isSameDay(parseISO(r.start_time), day));
      const km = dayRuns.reduce((s, r) => s + (r.distance_meters || 0), 0) / 1000;
      return {
        date: day,
        id: dayRuns.length === 1 ? dayRuns[0].id : dayRuns.length > 1 ? dayRuns[0].id : null,
        label: chartPeriod === "week"
          ? format(day, "EEE", { locale: fr })
          : format(day, "d"),
        km: Math.round(km * 10) / 10,
        hasActivity: dayRuns.length > 0,
      };
    });
  }, [allRuns, chartPeriod]);

  // Sync KPIs with chart period range
  const chartFilteredRuns = useMemo(() => {
    const now = new Date();
    let start: Date;
    if (chartPeriod === "week") {
      start = startOfWeek(now, { weekStartsOn: 1 });
    } else {
      start = startOfMonth(now);
    }
    return allRuns.filter((r) => {
      const d = parseISO(r.start_time);
      return isAfter(d, start) || isSameDay(d, start);
    });
  }, [allRuns, chartPeriod]);

  const selectedRun = selectedRunId ? allRuns.find((r) => r.id === selectedRunId) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Running</h1>
        <PeriodSelector value={kpiPeriod} onChange={setKpiPeriod} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Distance */}
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

        {/* Dénivelé */}
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

        {/* VO2Max */}
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
          <p className="text-xs text-muted-foreground sr-only">VO2 Max</p>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-foreground">Distance par sortie</h3>
          <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setChartPeriod(p); setSelectedRunId(null); }}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  chartPeriod === p
                    ? "bg-running text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "week" ? "Semaine" : "Mois"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              onClick={(e) => {
                const payload = e?.activePayload?.[0]?.payload;
                if (payload?.hasActivity && payload?.id) {
                  setSelectedRunId(payload.id);
                } else {
                  setSelectedRunId(null);
                }
              }}
              barCategoryGap={chartPeriod === "month" ? "20%" : "30%"}
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
                interval={chartPeriod === "month" ? 4 : 0}
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
                  const item = payload?.[0]?.payload;
                  return item?.date ? format(item.date, "EEEE d MMMM", { locale: fr }) : "";
                }}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
              />
              <Bar dataKey="km" radius={[3, 3, 0, 0]} cursor="pointer" maxBarSize={chartPeriod === "month" ? 16 : 40}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      !entry.hasActivity
                        ? "hsl(var(--muted))"
                        : entry.id === selectedRunId
                          ? "hsl(var(--rhr))"
                          : "url(#runGradient)"
                    }
                    opacity={selectedRunId && entry.id !== selectedRunId ? 0.4 : entry.hasActivity ? 1 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drill-down detail */}
      {selectedRun && (
        <div className="glass-card p-5 border-l-4 border-running animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              Détail — {format(parseISO(selectedRun.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
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
      )}

      {/* History as compact cards */}
      <div>
        <h3 className="font-display font-semibold text-foreground mb-3">Dernières sorties</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {allRuns.slice(0, 10).map((r) => {
            const distKm = (r.distance_meters || 0) / 1000;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedRunId(r.id)}
                className={`glass-card p-4 text-left transition-all hover:ring-1 hover:ring-running/50 ${
                  r.id === selectedRunId ? "ring-1 ring-running" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-running/15 mt-0.5">
                    <Footprints className="h-4 w-4 text-running" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {format(parseISO(r.start_time), "EEEE d MMMM", { locale: fr })}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{distKm.toFixed(1)} km</span>
                      <span>{computePace(r.duration_sec, r.distance_meters || 0)} /km</span>
                      <span>{Math.round(r.duration_sec / 60)} min</span>
                      {r.avg_hr && <span>{r.avg_hr} bpm</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
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

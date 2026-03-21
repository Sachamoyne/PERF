import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useActivities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  format,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Mountain, Wind, TrendingUp, TrendingDown, Clock, ArrowUp, Footprints, ChevronRight } from "lucide-react";
import { computePace } from "@/lib/garmin-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
  monthIndex?: number; // for year view drill-down
};

export default function Running() {
  const { data: allRuns = [] } = useActivities("running");
  const [period, setPeriod] = useState<Period>("month");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null); // 0-11 for year view
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setSelectedRunId(null);
    setSelectedMonth(null);
    setExpandedRunId(null);
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
    const dedupeRuns = (runs: any[]) => {
      const seen = new Set<string>();
      return runs.filter((r) => {
        const start = typeof r.start_time === "string" ? r.start_time : "";
        // Dédoublonnage “robuste”: même minute + même distance ≈ même séance importée deux fois
        const minuteKey = start ? start.slice(0, 16) : "";
        const distKey = Math.round((r.distance_meters || 0) / 10) * 10; // arrondi à 10m
        const durKey = Math.round((r.duration_sec || 0) / 5) * 5; // arrondi à 5s
        const key = `${minuteKey}|${distKey}|${durKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    if (period === "year") {
      const months = eachMonthOfInterval({ start: periodRange.start, end: periodRange.end });
      return months.map((month) => {
        const monthRuns = allRuns.filter((r) => {
          const d = new Date(r.start_time);
          return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
        });
        const uniqueMonthRuns = dedupeRuns(monthRuns);
        const km = uniqueMonthRuns.reduce((s, r) => s + (r.distance_meters || 0), 0) / 1000;
        return {
          label: format(month, "MMM", { locale: fr }),
          dateLabel: format(month, "MMMM yyyy", { locale: fr }),
          km: Math.round(km * 10) / 10,
          hasActivity: uniqueMonthRuns.length > 0,
          id: uniqueMonthRuns.length > 0 ? uniqueMonthRuns[0].id : null,
          monthIndex: month.getMonth(),
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
      const uniqueDayRuns = dedupeRuns(dayRuns);
      const km = uniqueDayRuns.reduce((s, r) => s + (r.distance_meters || 0), 0) / 1000;
      return {
        label: period === "week"
          ? format(day, "EEE", { locale: fr })
          : format(day, "d"),
        dateLabel: format(day, "EEEE d MMMM", { locale: fr }),
        km: Math.round(km * 10) / 10,
        hasActivity: uniqueDayRuns.length > 0,
        id: uniqueDayRuns.length > 0 ? uniqueDayRuns[0].id : null,
      };
    });
  }, [allRuns, period, periodRange]);

  // For year view: get runs of the selected month (default: current month)
  const displayMonth = selectedMonth ?? new Date().getMonth();
  const monthRuns = useMemo(() => {
    if (period !== "year") return [];
    const year = new Date().getFullYear();
    return allRuns
      .filter((r) => {
        const d = new Date(r.start_time);
        return d.getFullYear() === year && d.getMonth() === displayMonth;
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [allRuns, period, displayMonth]);

  const displayMonthLabel = useMemo(() => {
    const d = new Date(new Date().getFullYear(), displayMonth, 1);
    return format(d, "MMMM yyyy", { locale: fr });
  }, [displayMonth]);

  // For week/month view: selected run detail
  const displayRunId = selectedRunId ?? (filteredRuns.length > 0 ? filteredRuns[0].id : null);
  const selectedRun = displayRunId ? allRuns.find((r) => r.id === displayRunId) : null;
  const expandedRun = expandedRunId ? allRuns.find((r) => r.id === expandedRunId) : null;

  // Highlight logic for year view
  const activeMonthIndex = period === "year" ? displayMonth : null;

  const barMaxSize = period === "week" ? 40 : period === "month" ? 16 : 28;
  const xAxisInterval = period === "month" ? 4 : 0;

  const handleBarClick = (e: any) => {
    const payload = e?.activePayload?.[0]?.payload as ChartEntry | undefined;
    if (!payload?.hasActivity) return;

    if (period === "year" && payload.monthIndex !== undefined) {
      setSelectedMonth(payload.monthIndex);
      setExpandedRunId(null);
    } else if (payload.id) {
      setSelectedRunId(payload.id);
    }
  };

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
              onClick={handleBarClick}
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
                tickFormatter={(value: string) => {
                  // Pour la vue "Année", on affiche uniquement l'initiale du mois (J, F, M, ...)
                  if (period === "year") {
                    // value est déjà un label court type "janv", "févr", etc. → on garde la première lettre
                    return value?.charAt(0).toUpperCase();
                  }
                  return value;
                }}
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
                        : period === "year" && entry.monthIndex === activeMonthIndex
                          ? "hsl(var(--rhr))"
                          : period !== "year" && entry.id === displayRunId
                            ? "hsl(var(--rhr))"
                            : "url(#runGradient)"
                    }
                    opacity={
                      period === "year"
                        ? (activeMonthIndex !== null && entry.monthIndex !== activeMonthIndex ? 0.4 : entry.hasActivity ? 1 : 0.3)
                        : (displayRunId && entry.id !== displayRunId ? 0.4 : entry.hasActivity ? 1 : 0.3)
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail section — differs by period */}
      {period === "year" ? (
        <YearMonthDetail
          monthLabel={displayMonthLabel}
          runs={monthRuns}
          expandedRunId={expandedRunId}
          onExpandRun={setExpandedRunId}
          expandedRun={expandedRun}
        />
      ) : selectedRun ? (
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

/* ── Year view: Monthly activity list with drill-down ── */

type YearMonthDetailProps = {
  monthLabel: string;
  runs: any[];
  expandedRunId: string | null;
  onExpandRun: (id: string | null) => void;
  expandedRun: any;
};

function YearMonthDetail({ monthLabel, runs, expandedRunId, onExpandRun, expandedRun }: YearMonthDetailProps) {
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="glass-card p-5 border-l-4 border-running">
        <h3 className="font-display font-semibold text-foreground mb-4 capitalize">
          Activités de {monthLabel}
        </h3>

        {runs.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Footprints className="h-4 w-4 mr-2 opacity-50" />
            Aucune activité ce mois-ci
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs font-medium text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Distance</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Allure</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">D+</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Durée</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run, i) => (
                  <TableRow
                    key={run.id}
                    onClick={() => onExpandRun(expandedRunId === run.id ? null : run.id)}
                    className={`cursor-pointer transition-colors ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/10"
                    } ${expandedRunId === run.id ? "bg-running/10 hover:bg-running/15" : "hover:bg-muted/30"}`}
                  >
                    <TableCell className="text-sm font-medium text-foreground py-3">
                      {format(new Date(run.start_time), "EEE d MMM", { locale: fr })}
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {((run.distance_meters || 0) / 1000).toFixed(2)} km
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {computePace(run.duration_sec, run.distance_meters || 0)} /km
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {(run.total_elevation_gain || 0).toFixed(0)} m
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {formatDuration(run.duration_sec)}
                    </TableCell>
                    <TableCell className="py-3">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedRunId === run.id ? "rotate-90" : ""}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Expanded run detail */}
      {expandedRun && (
        <div key={expandedRun.id} className="glass-card p-5 border-l-4 border-rhr animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              Détail — {format(new Date(expandedRun.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
            </h3>
            <button onClick={() => onExpandRun(null)} className="text-muted-foreground hover:text-foreground text-sm">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <DetailStat icon={<MapPin className="h-4 w-4 text-running" />} label="Distance" value={`${((expandedRun.distance_meters || 0) / 1000).toFixed(2)} km`} />
            <DetailStat icon={<Clock className="h-4 w-4 text-running" />} label="Durée" value={formatDuration(expandedRun.duration_sec)} />
            <DetailStat icon={<Footprints className="h-4 w-4 text-running" />} label="Allure moy." value={`${computePace(expandedRun.duration_sec, expandedRun.distance_meters || 0)} /km`} />
            <DetailStat icon={<Mountain className="h-4 w-4 text-running" />} label="Dénivelé" value={`${(expandedRun.total_elevation_gain || 0).toFixed(0)} m`} />
            <DetailStat icon={<ArrowUp className="h-4 w-4 text-muted-foreground" />} label="Calories" value={expandedRun.calories ? `${expandedRun.calories} kcal` : "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared sub-components ── */

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

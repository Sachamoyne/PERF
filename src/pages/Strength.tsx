import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useHealthData";
import { useLatestBodyMetric, useBodyMetrics } from "@/hooks/useBodyMetrics";
import { useExerciseTrackingCards } from "@/hooks/useExerciseStats";
import {
  format,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  startOfYear, endOfYear, eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Dumbbell, Scale, TrendingUp, TrendingDown, Minus, Timer, Flame, Activity, X } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from "recharts";
import ExerciseCard from "@/components/strength/ExerciseCard";

type Period = "week" | "month" | "year";
const periodLabels: Record<Period, string> = { week: "Semaine", month: "Mois", year: "Année" };

type SessionChartEntry = {
  label: string;
  date: string;
  dateLabel: string;
  min: number;
  hasActivity: boolean;
  id: string | null;
  monthIndex?: number;
};

export default function Strength() {
  const { data: sessions = [] } = useActivities("strength");
  const [period, setPeriod] = useState<Period>("month");
  const [selectedSession, setSelectedSession] = useState<(typeof sessions)[number] | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const { data: latestMetrics = [] } = useLatestBodyMetric();
  const { data: bodyHistory = [] } = useBodyMetrics(30);
  const exerciseCards = useExerciseTrackingCards();

  const latest = latestMetrics[0];
  const previous = latestMetrics[1];

  const weightDelta = latest && previous && latest.weight_kg && previous.weight_kg
    ? (latest.weight_kg - previous.weight_kg).toFixed(1) : null;
  const fatDelta = latest && previous && latest.body_fat_pc && previous.body_fat_pc
    ? (latest.body_fat_pc - previous.body_fat_pc).toFixed(1) : null;
  const muscleDelta = latest && previous && latest.muscle_mass_kg && previous.muscle_mass_kg
    ? (latest.muscle_mass_kg - previous.muscle_mass_kg).toFixed(1) : null;

  const bodyChartData = bodyHistory
    .filter((m) => m.weight_kg || m.muscle_mass_kg)
    .map((m) => ({
      date: m.date, // ISO YYYY-MM-DD (formatting handled by XAxis tickFormatter)
      Poids: m.weight_kg,
      Muscle: m.muscle_mass_kg,
    }));

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

  const filteredSessions = useMemo(
    () => sessions.filter((s) => {
      const d = new Date(s.start_time);
      return d >= periodRange.start && d <= periodRange.end;
    }),
    [sessions, periodRange]
  );

  const chartData: SessionChartEntry[] = useMemo(() => {
    if (period === "year") {
      const months = eachMonthOfInterval({ start: periodRange.start, end: periodRange.end });
      return months.map((month) => {
        const monthSessions = sessions.filter((s) => {
          const d = new Date(s.start_time);
          return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
        });
        const totalMin = monthSessions.reduce((sum, s) => sum + Math.round((s.duration_sec || 0) / 60), 0);
        return {
          label: format(month, "MMM", { locale: fr }),
          date: format(month, "yyyy-MM-dd"),
          dateLabel: format(month, "MMMM yyyy", { locale: fr }),
          min: totalMin,
          hasActivity: monthSessions.length > 0,
          id: monthSessions.length > 0 ? monthSessions[0].id : null,
          monthIndex: month.getMonth(),
        };
      });
    }

    const days = eachDayOfInterval({ start: periodRange.start, end: periodRange.end });
    return days.map((day) => {
      const daySessions = sessions.filter((s) => {
        const d = new Date(s.start_time);
        return d.getFullYear() === day.getFullYear() &&
          d.getMonth() === day.getMonth() &&
          d.getDate() === day.getDate();
      });
      const totalMin = daySessions.reduce((sum, s) => sum + Math.round((s.duration_sec || 0) / 60), 0);
      return {
        label: period === "week"
          ? format(day, "EEE", { locale: fr })
          : format(day, "d"),
        date: format(day, "yyyy-MM-dd"),
        dateLabel: format(day, "EEEE d MMMM", { locale: fr }),
        min: totalMin,
        hasActivity: daySessions.length > 0,
        id: daySessions.length > 0 ? daySessions[0].id : null,
      };
    });
  }, [sessions, period, periodRange]);

  const activeMonthIndex = period === "year" ? (selectedMonth ?? new Date().getMonth()) : null;
  const xAxisInterval = period === "month" ? 4 : 0;
  const barMaxSize = period === "week" ? 40 : period === "month" ? 16 : 28;

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    setSelectedSession(null);
    setSelectedMonth(null);
  };

  const handleBarClick = (e: any) => {
    const payload = e?.activePayload?.[0]?.payload as SessionChartEntry | undefined;
    if (!payload?.hasActivity) return;

    if (period === "year" && payload.monthIndex !== undefined) {
      setSelectedMonth(payload.monthIndex);
      const year = new Date().getFullYear();
      const match = sessions.find((s) => {
        const d = new Date(s.start_time);
        return d.getFullYear() === year && d.getMonth() === payload.monthIndex;
      });
      setSelectedSession(match ?? null);
      return;
    }

    const match = sessions.find((s) => {
      const d = new Date(s.start_time);
      const labelDate = new Date(`${payload.date}T12:00:00`);
      return d.getFullYear() === labelDate.getFullYear()
        && d.getMonth() === labelDate.getMonth()
        && d.getDate() === labelDate.getDate();
    });
    setSelectedSession(match ?? null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Musculation</h1>
      </div>

      {/* Body Composition Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Poids"
          value={latest?.weight_kg ? `${latest.weight_kg} kg` : "—"}
          delta={weightDelta}
          icon={<Scale className="h-5 w-5 text-strength" />}
        />
        <MetricCard
          label="Masse Grasse"
          value={latest?.body_fat_pc ? `${latest.body_fat_pc}%` : "—"}
          delta={fatDelta}
          invertDelta
          icon={<TrendingDown className="h-5 w-5 text-destructive" />}
        />
        <MetricCard
          label="Masse Musculaire"
          value={latest?.muscle_mass_kg ? `${latest.muscle_mass_kg} kg` : "—"}
          delta={muscleDelta}
          icon={<Dumbbell className="h-5 w-5 text-strength" />}
        />
      </div>

      {/* Body Composition Chart */}
      {bodyChartData.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-display font-semibold text-foreground mb-3">Évolution 30 jours</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={bodyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => format(new Date(v), "dd/MM", { locale: fr })}
              />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="Poids" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Muscle" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Graphique séances */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold text-foreground">
            Durée par jour
          </h2>
          <PeriodSelector value={period} onChange={handlePeriodChange} />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} onClick={handleBarClick} barCategoryGap={period === "week" ? "30%" : "20%"}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              interval={xAxisInterval}
              tickFormatter={(value: string) => {
                if (period === "year") return value?.charAt(0).toUpperCase();
                return value;
              }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v} min`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--foreground))",
              }}
              formatter={(value: number) => [`${value} min`, "Durée"]}
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload as SessionChartEntry | undefined;
                return item?.dateLabel ?? "";
              }}
              cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
            />
            <Bar dataKey="min" radius={[3, 3, 0, 0]} cursor="pointer" maxBarSize={barMaxSize}>
              {chartData.map((entry, i) => {
                const isSelected = period === "year"
                  ? entry.monthIndex === activeMonthIndex
                  : selectedSession != null && entry.id === selectedSession.id;
                return (
                  <Cell
                    key={i}
                    fill={entry.hasActivity ? (isSelected ? "hsl(0, 55%, 35%)" : "hsl(var(--strength))") : "hsl(var(--muted))"}
                    opacity={entry.hasActivity ? 1 : 0.35}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Détail séance sélectionnée */}
      {selectedSession && (
        <div className="rounded-xl border-2 p-4 relative" style={{ borderColor: "hsl(var(--strength))" }}>
          <button
            onClick={() => setSelectedSession(null)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="font-display font-semibold text-foreground mb-3">
            Détail — {format(new Date(selectedSession.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
          </p>
          <div className="flex flex-wrap gap-6">
            <DetailStat icon={<Timer className="h-4 w-4 text-strength" />} label="Durée" value={`${Math.round(selectedSession.duration_sec / 60)} min`} />
            <DetailStat icon={<Flame className="h-4 w-4 text-strength" />} label="Calories" value={selectedSession.calories ? `${selectedSession.calories} kcal` : "—"} />
          </div>
        </div>
      )}

      {/* Dynamic Exercise Tracking */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <Activity className="h-5 w-5 text-strength" />
          Suivi de Progression
        </h2>
        {exerciseCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {exerciseCards.map((card) => (
              <ExerciseCard key={card.exercise_name} card={card} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Aucun exercice enregistré pour l’instant. Les séances de musculation seront importées automatiquement depuis Apple Health dès qu’elles apparaissent dans l’app Santé.
            </p>
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-3">Séances récentes</h2>
        <div className="space-y-2">
          {sessions.slice(0, 10).map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-strength/20 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-strength" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {format(new Date(s.start_time), "EEEE d MMMM yyyy", { locale: fr })}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Timer className="h-3.5 w-3.5" />
                  {Math.round(s.duration_sec / 60)} min
                </span>
                <span className="flex items-center gap-1">
                  <Flame className="h-3.5 w-3.5" />
                  {s.calories ?? "—"} kcal
                </span>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune séance enregistrée</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
      {(Object.keys(periodLabels) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === p
              ? "bg-strength text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {periodLabels[p]}
        </button>
      ))}
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

function MetricCard({ label, value, delta, invertDelta, icon }: {
  label: string; value: string; delta: string | null; invertDelta?: boolean; icon: React.ReactNode;
}) {
  const isPositive = delta ? parseFloat(delta) > 0 : null;
  const isGood = invertDelta ? !isPositive : isPositive;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold text-foreground">{value}</p>
      {delta && (
        <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${isGood ? "text-primary" : "text-destructive"}`}>
          {isPositive ? <TrendingUp className="h-3 w-3" /> : isPositive === false ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {parseFloat(delta) > 0 ? "+" : ""}{delta} vs précédent
        </div>
      )}
    </div>
  );
}

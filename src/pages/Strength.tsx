import { useActivities } from "@/hooks/useHealthData";
import { useLatestBodyMetric, useBodyMetrics } from "@/hooks/useBodyMetrics";
import { usePRCards } from "@/hooks/useExerciseStats";
import { useBodyMetricsSyncStatus, useManualBodySync } from "@/hooks/useBodyMetricsSync";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Dumbbell, Scale, TrendingUp, TrendingDown, Minus, Timer, Flame, Trophy, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import LogBodyMetricsDrawer from "@/components/strength/LogBodyMetricsDrawer";
import UpdatePRDrawer from "@/components/strength/UpdatePRDrawer";
import { toast } from "sonner";

export default function Strength() {
  const { data: sessions = [] } = useActivities("strength");
  const { data: latestMetrics = [] } = useLatestBodyMetric();
  const { data: bodyHistory = [] } = useBodyMetrics(30);
  const prCards = usePRCards();
  const { data: syncStatus } = useBodyMetricsSyncStatus();
  const syncMutation = useManualBodySync();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => toast.success("Synchronisation lancée"),
      onError: (err) => toast.error(err.message),
    });
  };
  const { data: bodyHistory = [] } = useBodyMetrics(30);
  const prCards = usePRCards();

  const latest = latestMetrics[0];
  const previous = latestMetrics[1];

  const weightDelta = latest && previous && latest.weight_kg && previous.weight_kg
    ? (latest.weight_kg - previous.weight_kg).toFixed(1) : null;
  const fatDelta = latest && previous && latest.body_fat_pc && previous.body_fat_pc
    ? (latest.body_fat_pc - previous.body_fat_pc).toFixed(1) : null;
  const muscleDelta = latest && previous && latest.muscle_mass_kg && previous.muscle_mass_kg
    ? (latest.muscle_mass_kg - previous.muscle_mass_kg).toFixed(1) : null;

  const chartData = bodyHistory
    .filter((m) => m.weight_kg || m.muscle_mass_kg)
    .map((m) => ({
      date: format(new Date(m.date), "dd/MM"),
      Poids: m.weight_kg,
      Muscle: m.muscle_mass_kg,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">Musculation</h1>
        <LogBodyMetricsDrawer />
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

      {/* Chart */}
      {chartData.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-display font-semibold text-foreground mb-3">Évolution 30 jours</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="Poids" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Muscle" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* PR Grid */}
      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-strength" />
          Records Personnels (3×10)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {prCards.map((pr) => (
            <div key={pr.exercise_name} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{pr.exercise_name}</span>
                <UpdatePRDrawer exerciseName={pr.exercise_name} />
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-display font-bold text-strength">
                  {pr.current_weight > 0 ? `${pr.current_weight} kg` : "—"}
                </span>
                {pr.gain !== 0 && (
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${pr.gain > 0 ? "text-primary" : "text-destructive"}`}>
                    {pr.gain > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {pr.gain > 0 ? "+" : ""}{pr.gain} kg
                  </span>
                )}
              </div>
              {pr.date && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(pr.date), "d MMM yyyy", { locale: fr })}
                </span>
              )}
            </div>
          ))}
        </div>
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

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActivePhase } from "@/hooks/useActivePhase";
import { CALORIES_PHASE_INFO, STEPS_PHASE_INFO, WEIGHT_PHASE_CONTENT } from "@/constants/phaseContent";
import { getParisLocalDateString, useLatestNutrition } from "@/hooks/useLatestNutrition";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ComposedChart,
  Legend,
} from "recharts";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";

type Period = 7 | 30 | 90 | 365;
const PERIODS: { label: string; days: Period }[] = [
  { label: "7j", days: 7 },
  { label: "1m", days: 30 },
  { label: "3m", days: 90 },
  { label: "1a", days: 365 },
];

function periodStart(days: number) {
  const d = subDays(new Date(), days);
  return format(d, "yyyy-MM-dd");
}

function fmtDuration(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${String(mm).padStart(2, "0")}`;
}

function DetailShell({
  title,
  period,
  onPeriodChange,
  children,
}: {
  title: string;
  period: Period;
  onPeriodChange: (p: Period) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Dashboard
        </Link>
        <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.label}
              onClick={() => onPeriodChange(p.days)}
              className={`period-pill ${
                period === p.days ? "period-pill-active" : ""
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <h1 className="text-2xl font-display font-bold text-foreground">{title}</h1>
      {children}
    </div>
  );
}

function ObjectiveCard({ label, current, target, unit }: { label: string; current: number; target: number; unit: string }) {
  const pct = Math.max(0, Math.min((current / target) * 100, 100));
  return (
    <div className="glass-card p-4 space-y-2">
      <h3 className="font-display font-semibold text-foreground">Objectif</h3>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{Math.round(current)} / {Math.round(target)} {unit}</p>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function InfoCard({ text }: { text: string }) {
  return (
    <div className="glass-card p-4">
      <h3 className="font-display font-semibold text-foreground mb-2">À savoir</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function StaticTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="glass-card p-4 overflow-x-auto">
      <h3 className="font-display font-semibold text-foreground mb-3">Tableau de référence</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th key={h} className="text-left py-2 pr-4 text-muted-foreground font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 text-foreground">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyData() {
  return <div className="glass-card p-6 text-sm text-muted-foreground">Aucune donnée sur la période sélectionnée.</div>;
}

function useHealthMetricSeries(metricType: "calories_total" | "protein" | "steps" | "hrv" | "vo2max", days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["detail_metric_series", metricType, days, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { date: string; value: number }[];
      const { data, error } = await supabase
        .from("health_metrics")
        .select("date, value")
        .eq("metric_type", metricType)
        .gte("date", periodStart(days))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({ date: d.date, value: d.value }));
    },
  });
}

function useBodySeries(field: "weight_kg" | "body_fat_pc", days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["detail_body_series", field, days, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { date: string; value: number }[];
      const { data, error } = await supabase
        .from("body_metrics")
        .select(`date, ${field}`)
        .gte("date", periodStart(days))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? [])
        .map((d) => ({ date: d.date, value: d[field] as number | null }))
        .filter((d) => d.value != null) as { date: string; value: number }[];
    },
  });
}

function useSleepSeries(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["detail_sleep_series", days, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { date: string; hours: number; score: number | null }[];
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("date, duration_hours, score")
        .gte("date", periodStart(days))
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        date: d.date,
        hours: d.duration_hours ?? 0,
        score: d.score,
      }));
    },
  });
}

function useWorkoutSeries(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["detail_workout_series", days, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as { date: string; minutes: number; sport_type: string }[];
      const { data, error } = await supabase
        .from("activities")
        .select("start_time, duration_sec, sport_type")
        .eq("user_id", user.id)
        .gte("start_time", `${periodStart(days)}T00:00:00`)
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        date: a.start_time.slice(0, 10),
        minutes: Math.round(a.duration_sec / 60),
        sport_type: a.sport_type,
      }));
    },
  });
}

function lineChartData(series: { date: string; value: number }[]) {
  return series.map((d) => ({ ...d, label: format(new Date(`${d.date}T12:00:00`), "d MMM", { locale: fr }) }));
}

type NutritionKey =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "potassium"
  | "calcium"
  | "iron"
  | "magnesium"
  | "zinc"
  | "vitaminD"
  | "vitaminC"
  | "omega3"
  | "sodium"
  | "water";

type NutritionPoint = { date: string; value: number };
type NutritionSeriesMap = Record<NutritionKey, NutritionPoint[]>;

type NutritionDef = {
  key: NutritionKey;
  label: string;
  dataTypes: string[];
  unit: string;
  target: number;
  dashWhenZero: boolean;
  supportedByPlugin: boolean;
};

const NUTRITION_DEFS: NutritionDef[] = [
  { key: "calories", label: "Calories", dataTypes: ["dietaryEnergyConsumed"], unit: "kcal", target: 0, dashWhenZero: false, supportedByPlugin: true },
  { key: "protein", label: "Protéines", dataTypes: ["dietaryProtein"], unit: "g", target: 0, dashWhenZero: false, supportedByPlugin: true },
  { key: "carbs", label: "Glucides", dataTypes: ["dietaryCarbohydrates"], unit: "g", target: 0, dashWhenZero: false, supportedByPlugin: true },
  { key: "fat", label: "Lipides", dataTypes: ["dietaryFat"], unit: "g", target: 0, dashWhenZero: false, supportedByPlugin: true },
  { key: "fiber", label: "Fibres", dataTypes: [], unit: "g", target: 45, dashWhenZero: true, supportedByPlugin: false },
  { key: "potassium", label: "Potassium", dataTypes: [], unit: "mg", target: 3500, dashWhenZero: true, supportedByPlugin: false },
  { key: "calcium", label: "Calcium", dataTypes: [], unit: "mg", target: 1000, dashWhenZero: true, supportedByPlugin: false },
  { key: "iron", label: "Fer", dataTypes: [], unit: "mg", target: 9, dashWhenZero: true, supportedByPlugin: false },
  { key: "magnesium", label: "Magnésium", dataTypes: [], unit: "mg", target: 400, dashWhenZero: true, supportedByPlugin: false },
  { key: "zinc", label: "Zinc", dataTypes: [], unit: "mg", target: 11, dashWhenZero: true, supportedByPlugin: false },
  { key: "vitaminD", label: "Vitamine D", dataTypes: [], unit: "UI", target: 1750, dashWhenZero: true, supportedByPlugin: false },
  { key: "vitaminC", label: "Vitamine C", dataTypes: [], unit: "mg", target: 82, dashWhenZero: true, supportedByPlugin: false },
  { key: "omega3", label: "Oméga-3", dataTypes: [], unit: "g", target: 2.5, dashWhenZero: true, supportedByPlugin: false },
  { key: "sodium", label: "Sodium", dataTypes: [], unit: "mg", target: 1900, dashWhenZero: true, supportedByPlugin: false },
  { key: "water", label: "Eau", dataTypes: [], unit: "L", target: 3, dashWhenZero: true, supportedByPlugin: false },
];

const CHART_NUTRIENT_KEYS: NutritionKey[] = ["calories", "protein", "carbs", "fat"];

const EMPTY_NUTRITION_SERIES: NutritionSeriesMap = NUTRITION_DEFS.reduce((acc, n) => {
  acc[n.key] = [];
  return acc;
}, {} as NutritionSeriesMap);

function useNutritionSeries(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["detail_nutrition_series", days, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<NutritionSeriesMap> => {
      if (!user) return EMPTY_NUTRITION_SERIES;
      const startDay = periodStart(days);
      const endDay = getParisLocalDateString();
      console.log("[calories-detail] fetch nutrition series start", {
        source: "supabase.health_metrics",
        days,
        startDate: startDay,
        endDate: endDay,
      });

      const result: NutritionSeriesMap = NUTRITION_DEFS.reduce((acc, n) => {
        acc[n.key] = [];
        return acc;
      }, {} as NutritionSeriesMap);

      const metricToKey: Record<string, NutritionKey> = {
        calories_total: "calories",
        protein: "protein",
        carbs: "carbs",
        fat: "fat",
      };

      const { data, error } = await supabase
        .from("health_metrics")
        .select("date, metric_type, value")
        .eq("user_id", user.id)
        .in("metric_type", ["calories_total", "protein", "carbs", "fat"])
        .gte("date", startDay)
        .lte("date", endDay)
        .order("date", { ascending: true });

      if (error) {
        console.warn("[calories-detail] fetch nutrition series failed", error);
        throw error;
      }

      const byMetricAndDay = new Map<string, number>();
      for (const row of data ?? []) {
        const key = metricToKey[row.metric_type];
        if (!key) continue;
        byMetricAndDay.set(`${key}:${row.date}`, row.value);
      }

      for (const key of CHART_NUTRIENT_KEYS) {
        const points: NutritionPoint[] = [];
        for (const [compound, value] of byMetricAndDay.entries()) {
          if (!compound.startsWith(`${key}:`)) continue;
          const date = compound.slice(key.length + 1);
          points.push({ date, value: Math.round(value * 10) / 10 });
        }
        result[key] = points.sort((a, b) => a.date.localeCompare(b.date));
      }

      console.log("[calories-detail] fetch nutrition series done", {
        source: "supabase.health_metrics",
        rows: (data ?? []).length,
        series: {
          calories: result.calories.length,
          protein: result.protein.length,
          carbs: result.carbs.length,
          fat: result.fat.length,
        },
      });

      return result;
    },
  });
}

export function CaloriesDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const [chartKey, setChartKey] = useState<NutritionKey>("calories");
  const { phase, activePhaseKey } = useActivePhase();
  const { data: nutritionSeries = EMPTY_NUTRITION_SERIES } = useNutritionSeries(period);
  const todayParis = getParisLocalDateString();
  const { data: latestNutrition } = useLatestNutrition(todayParis);

  useEffect(() => {
    console.log("[calories-detail] mounted", { date: todayParis, period });
  }, [todayParis, period]);

  const chartSeries = nutritionSeries[chartKey] ?? [];
  const chartData = lineChartData(chartSeries);
  const chartDef = NUTRITION_DEFS.find((n) => n.key === chartKey) ?? NUTRITION_DEFS[0];
  const chartTarget =
    chartKey === "calories" ? phase.calories :
    chartKey === "protein" ? phase.protein :
    chartKey === "carbs" ? phase.carbs :
    chartKey === "fat" ? phase.fat :
    chartDef.target;
  const hasTargets = phase.calories != null && phase.protein != null && phase.carbs != null && phase.fat != null;
  const caloriesToday = latestNutrition?.calories ?? 0;
  const remaining = Math.max((phase.calories ?? 0) - caloriesToday, 0);
  const hasAnyData = useMemo(
    () => NUTRITION_DEFS.some((n) => (nutritionSeries[n.key] ?? []).length > 0),
    [nutritionSeries]
  );

  return (
    <DetailShell title="Calories" period={period} onPeriodChange={setPeriod}>
      <div className="flex gap-1 rounded-lg bg-secondary p-0.5 w-fit">
        {CHART_NUTRIENT_KEYS.map((key) => {
          const nutrient = NUTRITION_DEFS.find((n) => n.key === key);
          if (!nutrient) return null;
          return (
            <button
              key={key}
              onClick={() => setChartKey(key)}
              className={`period-pill ${
                chartKey === key ? "period-pill-active" : ""
              }`}
            >
              {nutrient.label}
            </button>
          );
        })}
      </div>
      <div className="glass-card p-4 h-[300px]">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Aucune donnée {chartDef.label.toLowerCase()} sur la période.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              {typeof chartTarget === "number" && chartTarget > 0 ? (
                <ReferenceLine y={chartTarget} stroke="hsl(25,95%,53%)" strokeDasharray="5 5" />
              ) : null}
              <Line type="monotone" dataKey="value" stroke="hsl(25,95%,53%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Calories du jour</p><p className="text-2xl font-display">{Math.round(caloriesToday)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Objectif</p><p className="text-2xl font-display">{phase.calories ?? "—"}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Restantes</p><p className="text-2xl font-display">{hasTargets ? Math.round(remaining) : "—"}</p></div>
      </div>
      {!hasTargets && (
        <div className="glass-card p-4 text-sm text-muted-foreground">
          Complète ton profil dans Paramètres pour calculer tes objectifs personnalisés.
        </div>
      )}
      {!hasAnyData && <EmptyData />}
      <InfoCard text={CALORIES_PHASE_INFO[activePhaseKey]} />
      <StaticTable
        headers={["Nutriment", "Objectif/jour", "Rôle", "Aliments riches"]}
        rows={[
          ["Calories", phase.calories != null ? `${phase.calories} kcal` : "—", "Énergie pour s'entraîner et construire du muscle", "Tous les aliments"],
          ["Protéines", phase.protein != null ? `${phase.protein}g` : "—", "Synthèse musculaire (MPS)", "Poulet, œufs, thon, skyr, whey"],
          ["Glucides", phase.carbs != null ? `${phase.carbs}g` : "—", "Carburant musculaire, recharge glycogène", "Riz, flocons d'avoine, pâtes, banane"],
          ["Lipides", phase.fat != null ? `${phase.fat}g` : "—", "Production de testostérone et hormones anabolisantes", "Noix de cajou, huile d'olive, saumon, avocat"],
        ]}
      />
    </DetailShell>
  );
}

export function WeightDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase, activePhaseKey } = useActivePhase();
  const { data: series = [] } = useBodySeries("weight_kg", period);
  if (series.length === 0) return <DetailShell title="Poids" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const current = series.at(-1)?.value ?? 0;
  const start = series[0]?.value ?? current;
  const delta = current - start;
  const trend = Math.abs(delta) < 0.2 ? "stable" : delta > 0 ? "hausse" : "baisse";
  const phaseIsStable = phase.weightMonthlyMinKg === 0 && phase.weightMonthlyMaxKg === 0;
  const phaseTargetMonthly = Math.max(
    0.2,
    Math.max(Math.abs(phase.weightMonthlyMinKg), Math.abs(phase.weightMonthlyMaxKg))
  );
  const phaseObjectiveLabel = phaseIsStable ? "Rythme cible mensuel (stable)" : "Rythme cible mensuel";
  const weightPhaseContent = WEIGHT_PHASE_CONTENT[activePhaseKey];
  return (
    <DetailShell title="Poids" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="hsl(262,83%,58%)" fill="hsl(262,83%,58%)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Poids actuel</p><p className="text-2xl font-display">{current.toFixed(1)} kg</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Variation période</p><p className="text-2xl font-display">{delta >= 0 ? "+" : ""}{delta.toFixed(1)} kg</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Tendance</p><p className="text-2xl font-display capitalize">{trend}</p></div>
      </div>
      <ObjectiveCard label={phaseObjectiveLabel} current={Math.abs(delta)} target={phaseTargetMonthly} unit="kg" />
      <InfoCard text={weightPhaseContent.info} />
      <StaticTable headers={["Indicateur", "Valeur cible", "Interprétation"]} rows={[
        ["Rythme de prise", weightPhaseContent.targetRow, "Objectif de la phase active"],
        ["Poids à jeun", "Mesurer le matin, après toilettes", "Réduire la variabilité"],
        ["Variation normale jour/jour", "±0,5 à ±1,5 kg", "Eau, digestion — pas de vraie prise de gras"],
        ["Signal d'alerte", ">1,5 kg/mois", "Ajuster les calories à la baisse"],
      ]} />
    </DetailShell>
  );
}

export function BodyFatDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { data: series = [] } = useBodySeries("body_fat_pc", period);
  if (series.length === 0) return <DetailShell title="Masse Grasse" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const current = series.at(-1)?.value ?? 0;
  const start = series[0]?.value ?? current;
  const delta = current - start;
  const trend = Math.abs(delta) < 0.2 ? "stable" : delta > 0 ? "hausse" : "baisse";
  return (
    <DetailShell title="Masse Grasse" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="hsl(25,95%,53%)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">% actuel</p><p className="text-2xl font-display">{current.toFixed(1)}%</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Variation</p><p className="text-2xl font-display">{delta >= 0 ? "+" : ""}{delta.toFixed(1)}%</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Tendance</p><p className="text-2xl font-display capitalize">{trend}</p></div>
      </div>
      <ObjectiveCard label="Zone cible lean bulk" current={Math.max(0, 16 - current)} target={6} unit="pts" />
      <InfoCard text="À 10-12% de masse grasse, tu es dans la zone optimale pour la prise de muscle tout en restant lean. En dessous de 8%, la production de testostérone commence à chuter. Au-dessus de 15%, le ratio signal anabolique/catabolique se dégrade." />
      <StaticTable headers={["Zone", "% masse grasse", "Signification"]} rows={[
        ["Athlète élite", "6-10%", "Très lean, visible"],
        ["Optimal lean bulk", "10-13%", "Idéal pour toi"],
        ["Acceptable", "13-16%", "Légère accumulation"],
        ["Trop élevé", ">16%", "Envisager une phase de cut"],
      ]} />
    </DetailShell>
  );
}

export function ProteinDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase } = useActivePhase();
  const { data: series = [] } = useHealthMetricSeries("protein", period);
  if (series.length === 0) return <DetailShell title="Protéines" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const today = series.at(-1)?.value ?? 0;
  const target = phase.protein;
  const targetSafe = target ?? 0;
  return (
    <DetailShell title="Protéines" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            {targetSafe > 0 ? <ReferenceLine y={targetSafe} stroke="hsl(172,66%,50%)" strokeDasharray="5 5" /> : null}
            <Bar dataKey="value" fill="hsl(172,66%,50%)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Protéines du jour</p><p className="text-2xl font-display">{Math.round(today)} g</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Objectif</p><p className="text-2xl font-display">{target != null ? `${target} g` : "—"}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">% atteint</p><p className="text-2xl font-display">{targetSafe > 0 ? `${Math.round((today / targetSafe) * 100)}%` : "—"}</p></div>
      </div>
      {targetSafe > 0 ? <ObjectiveCard label="Objectif protéines journalier" current={today} target={targetSafe} unit="g" /> : null}
      <InfoCard text={`Les protéines sont les briques de construction du muscle. L'objectif journalier est piloté par ta phase active.`} />
      <StaticTable headers={["Aliment", "Portion", "Protéines"]} rows={[
        ["Poulet (blanc)", "200g", "~46g"],
        ["Thon en boîte", "150g", "~35g"],
        ["Skyr", "200g", "~24g"],
        ["Whey", "1 dose (30g)", "~24g"],
        ["Œufs", "3 œufs", "~18g"],
        ["Saumon", "150g", "~30g"],
        ["Fromage blanc 0%", "200g", "~20g"],
      ]} />
    </DetailShell>
  );
}

export function SleepDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase } = useActivePhase();
  const { data: series = [] } = useSleepSeries(period);
  if (series.length === 0) return <DetailShell title="Sommeil" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = series.map((d) => ({ ...d, label: format(new Date(`${d.date}T12:00:00`), "d MMM", { locale: fr }) }));
  const avgHours = series.reduce((s, d) => s + d.hours, 0) / series.length;
  const avgScore = series.filter((d) => d.score != null).reduce((s, d) => s + (d.score ?? 0), 0) / Math.max(1, series.filter((d) => d.score != null).length);
  const best = [...series].sort((a, b) => b.hours - a.hours)[0];
  return (
    <DetailShell title="Sommeil" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis yAxisId="h" />
            <YAxis yAxisId="s" orientation="right" domain={[0, 99]} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="h" dataKey="hours" fill="hsl(217,91%,60%)" name="Heures" />
            <Line yAxisId="s" type="monotone" dataKey="score" stroke="hsl(152,60%,48%)" name="Score Garmin" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Heures moyennes</p><p className="text-2xl font-display">{avgHours.toFixed(1)} h</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Score moyen</p><p className="text-2xl font-display">{Math.round(avgScore)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Meilleure nuit</p><p className="text-2xl font-display">{best.hours.toFixed(1)} h</p></div>
      </div>
      <ObjectiveCard label="Objectif durée de sommeil" current={avgHours} target={phase.sleepHoursTarget} unit="h" />
      <InfoCard text="Le sommeil est le moment où 70% de la production de GH (hormone de croissance) a lieu. Moins de 7h = récupération musculaire compromise, cortisol élevé, appétit dérégulé. Entre 22h et 2h du matin, le sommeil est particulièrement récupérateur." />
      <StaticTable headers={["Métrique", "Cible", "Signification"]} rows={[
        ["Durée totale", "8-9h", "Optimal pour la récupération musculaire"],
        ["Score Garmin", ">80/99", "Bonne qualité"],
        ["Heure de coucher", "Avant 23h", "Maximise les cycles profonds"],
        ["Sommeil profond", ">1h30", "Pic de production de GH"],
        ["Régularité", "±30 min", "Stabilise le rythme circadien"],
      ]} />
    </DetailShell>
  );
}

export function StepsDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase, activePhaseKey } = useActivePhase();
  const { data: series = [] } = useHealthMetricSeries("steps", period);
  if (series.length === 0) return <DetailShell title="Pas" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const today = series.at(-1)?.value ?? 0;
  const avg = series.reduce((s, d) => s + d.value, 0) / series.length;
  const above = series.filter((d) => d.value >= phase.stepsTarget).length;
  return (
    <DetailShell title="Pas" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <ReferenceLine y={phase.stepsTarget} stroke="hsl(152,60%,48%)" strokeDasharray="5 5" />
            <Bar dataKey="value" fill="hsl(152,60%,48%)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Pas du jour</p><p className="text-2xl font-display">{Math.round(today)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Moyenne période</p><p className="text-2xl font-display">{Math.round(avg)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Jours au-dessus de l'objectif</p><p className="text-2xl font-display">{above}</p></div>
      </div>
      <ObjectiveCard label="Objectif quotidien" current={today} target={phase.stepsTarget} unit="pas" />
      <InfoCard text={STEPS_PHASE_INFO[activePhaseKey]} />
      <StaticTable headers={["Niveau", "Pas/jour", "Signification"]} rows={[
        ["Sédentaire", "<5 000", "NEAT insuffisant"],
        ["Actif", "7 500-10 000", "Bien"],
        ["Très actif", ">10 000", "Excellent pour la phase active"],
      ]} />
    </DetailShell>
  );
}

export function HrvDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { data: series = [] } = useHealthMetricSeries("hrv", period);
  if (series.length === 0) return <DetailShell title="HRV" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const current = series.at(-1)?.value ?? 0;
  const avg = series.reduce((s, d) => s + d.value, 0) / series.length;
  const trend = current - avg;
  return (
    <DetailShell title="HRV" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="hsl(152,60%,48%)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">HRV actuel</p><p className="text-2xl font-display">{Math.round(current)} ms</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Moyenne période</p><p className="text-2xl font-display">{Math.round(avg)} ms</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Tendance</p><p className="text-2xl font-display">{trend >= 0 ? "+" : ""}{trend.toFixed(1)} ms</p></div>
      </div>
      <ObjectiveCard label="Maintenir au-dessus de ta moyenne" current={current} target={avg || 1} unit="ms" />
      <InfoCard text="Le HRV (variabilité de la fréquence cardiaque) est le meilleur indicateur de récupération du système nerveux autonome. Un HRV en baisse sur plusieurs jours = corps sous stress, risque de surentraînement. Entraîne-toi intensément quand il est haut, récupère quand il est bas." />
      <StaticTable headers={["HRV", "Interprétation", "Action recommandée"]} rows={[
        ["Ton HRV normal +10%", "Excellente récupération", "Séance intensive OK"],
        ["Dans ta norme", "Récupération normale", "Entraînement planifié"],
        ["Ton HRV normal -10%", "Fatigue accumulée", "Réduire l'intensité"],
        ["Ton HRV normal -20%", "Surmenage", "Repos actif uniquement"],
      ]} />
    </DetailShell>
  );
}

export function Vo2maxDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase } = useActivePhase();
  const { data: series = [] } = useHealthMetricSeries("vo2max", period);
  if (series.length === 0) return <DetailShell title="VO2Max" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const data = lineChartData(series);
  const current = series.at(-1)?.value ?? 0;
  const start = series[0]?.value ?? current;
  const delta = current - start;
  const percentile = current >= 60 ? "Top 5%" : current >= 55 ? "Top 10-15%" : current >= 50 ? "Top 25%" : current >= 45 ? "Moyenne haute" : "Moyenne ou en dessous";
  return (
    <DetailShell title="VO2Max" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="hsl(172,66%,50%)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">VO2Max actuel</p><p className="text-2xl font-display">{current.toFixed(1)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Variation</p><p className="text-2xl font-display">{delta >= 0 ? "+" : ""}{delta.toFixed(1)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Percentile estimé</p><p className="text-2xl font-display">{percentile}</p></div>
      </div>
      <ObjectiveCard label="Objectif VO2Max hybride" current={current} target={phase.vo2maxTarget} unit="ml/kg/min" />
      <InfoCard text="Le VO2Max mesure ta capacité maximale à utiliser l'oxygène. Pour un athlète hybrid, >55 ml/kg/min est excellent. Il s'améliore avec le travail en zone 2 (course à allure conversation) et les séances HIIT. Avec 58 ml/kg/min, tu es dans le top 10% pour ton âge." />
      <StaticTable headers={["VO2Max (ml/kg/min)", "Niveau", "Percentile (homme 20-25 ans)"]} rows={[
        [">60", "Élite", "Top 5%"],
        ["55-60", "Excellent", "Top 10-15%"],
        ["50-55", "Très bien", "Top 25%"],
        ["45-50", "Bien", "Moyenne haute"],
        ["<45", "À améliorer", "Moyenne ou en dessous"],
      ]} />
    </DetailShell>
  );
}

export function TrainingDetailPage() {
  const [period, setPeriod] = useState<Period>(30);
  const { phase } = useActivePhase();
  const { data: rows = [] } = useWorkoutSeries(period);
  if (rows.length === 0) return <DetailShell title="Entraînement" period={period} onPeriodChange={setPeriod}><EmptyData /></DetailShell>;
  const byDay = new Map<string, number>();
  const bySport = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.minutes);
    bySport.set(r.sport_type, (bySport.get(r.sport_type) ?? 0) + r.minutes);
  }
  const chartData = Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, minutes]) => ({ date, minutes, label: format(new Date(`${date}T12:00:00`), "d MMM", { locale: fr }) }));
  const totalMin = rows.reduce((s, r) => s + r.minutes, 0);
  const sessions = rows.length;
  const planned = period === 7
    ? phase.plannedSessionsPerWeek
    : period === 30
      ? phase.plannedSessionsPerWeek * 4
      : period === 90
        ? phase.plannedSessionsPerWeek * 12
        : phase.plannedSessionsPerWeek * 48;
  const sportSplit = Array.from(bySport.entries()).map(([sport, min]) => `${sport}: ${Math.round((min / totalMin) * 100)}%`).join(" · ");
  return (
    <DetailShell title="Entraînement" period={period} onPeriodChange={setPeriod}>
      <div className="glass-card p-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="minutes" fill="hsl(262,83%,58%)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Volume total</p><p className="text-2xl font-display">{fmtDuration(totalMin * 60)}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Répartition sports</p><p className="text-sm font-medium text-foreground">{sportSplit}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-muted-foreground">Planifiées vs réalisées</p><p className="text-2xl font-display">{sessions}/{planned}</p></div>
      </div>
      <ObjectiveCard label="Objectif séances planifiées" current={sessions} target={planned} unit="séances" />
      <InfoCard text="Pour un objectif de physique hybride, le volume optimal est de 5-6 séances/semaine réparties entre musculation (4 séances) et cardio (2-3 séances). Le volume de musculation est le principal driver de la prise de muscle." />
      <StaticTable headers={["Type", "Fréquence cible", "Durée", "Priorité"]} rows={[
        ["Musculation", "4x/semaine", "60-75 min", "★★★"],
        ["Course zone 2", "1x/semaine", "45-60 min", "★★"],
        ["HIIT", "1x/semaine", "30-45 min", "★★"],
        ["Tennis/Padel", "Optionnel", "Variable", "★"],
        ["Repos complet", "1 jour/semaine", "—", "★★★"],
      ]} />
    </DetailShell>
  );
}

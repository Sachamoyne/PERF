import { Footprints, Scale, Percent, Wind, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CaloriesCard } from "@/components/dashboard/CaloriesCard";
import { WorkoutTodayCard } from "@/components/dashboard/WorkoutTodayCard";
import { SleepManualCard } from "@/components/dashboard/SleepManualCard";
import { ManualMetricCard } from "@/components/dashboard/ManualMetricCard";
import { CalorieBalanceCard } from "@/components/dashboard/CalorieBalanceCard";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { CentralManualEntryFab } from "@/components/dashboard/CentralManualEntryFab";

function getParisLocalDateString(): string {
  return new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

function DateNav({ offset, setOffset }: {
  offset: number;
  setOffset: (fn: (o: number) => number) => void
}) {
  const isToday = offset === 0;
  const parisToday = new Date(`${getParisLocalDateString()}T12:00:00`);
  const date = isToday ? parisToday : subDays(parisToday, Math.abs(offset));
  const label = isToday ? "Aujourd'hui" : format(date, "d MMMM", { locale: fr });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOffset((o) => o - 1)}
        className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[110px] text-center">{label}</span>
      <button
        onClick={() => setOffset((o) => Math.min(o + 1, 0))}
        disabled={isToday}
        className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const [offset, setOffset] = useState(0);
  const isToday = offset === 0;
  const parisToday = new Date(`${getParisLocalDateString()}T12:00:00`);
  const selectedDate = isToday ? parisToday : subDays(parisToday, Math.abs(offset));
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-1">Donnees Apple Sante</p>
        </div>
        <DateNav offset={offset} setOffset={setOffset} />
      </div>

      {/* Row 1 : Calories + Poids + Masse Grasse */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CaloriesCard date={selectedDateStr} detailPath="/details/calories" />
        <KpiCard
          metricType="weight"
          label="Poids"
          unit="kg"
          color="hsl(var(--primary))"
          icon={<Scale className="h-4 w-4" />}
          source="body_metrics"
          bodyField="weight_kg"
          forceRaw
          detailPath="/details/weight"
        />
        <KpiCard
          metricType="body_fat"
          label="Masse Grasse"
          unit="%"
          color="hsl(var(--warning))"
          icon={<Percent className="h-4 w-4" />}
          source="body_metrics"
          bodyField="body_fat_pc"
          invertDelta
          forceRaw
          detailPath="/details/body-fat"
        />
      </div>

      {/* Row 2 : Protéines + Sommeil + Pas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          metricType="protein"
          label="Protéines"
          unit="g"
          color="hsl(var(--primary))"
          icon={<Activity className="h-4 w-4" />}
          detailPath="/details/protein"
        />
        <SleepManualCard date={selectedDateStr} detailPath="/details/sleep" />
        <KpiCard
          metricType="steps"
          label="Pas"
          unit=""
          color="hsl(var(--primary))"
          icon={<Footprints className="h-4 w-4" />}
          detailPath="/details/steps"
        />
      </div>

      {/* Row 3 : HRV + Workout + VO2Max */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ManualMetricCard
          metricType="hrv"
          label="HRV"
          unit="ms"
          color="hsl(var(--primary))"
          icon={<Activity className="h-4 w-4" />}
          targetValue={60}
          detailPath="/details/hrv"
        />
        <WorkoutTodayCard date={selectedDateStr} detailPath="/details/training" />
        <ManualMetricCard
          metricType="vo2max"
          label="VO2Max"
          unit="ml/kg/min"
          color="hsl(var(--primary))"
          icon={<Wind className="h-4 w-4" />}
          targetValue={50}
          detailPath="/details/vo2max"
        />
      </div>

      {/* Row 4 : Balance calorique + Semaine sportive */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <CalorieBalanceCard date={selectedDateStr} detailPath="/details/calories" />
        <WeeklySummary date={selectedDateStr} detailPath="/details/training" />
      </div>

      <CentralManualEntryFab date={selectedDateStr} />
    </div>
  );
}

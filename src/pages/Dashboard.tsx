import { Moon, Footprints, Scale, Percent, Wind, Activity, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { CaloriesCard } from "@/components/dashboard/CaloriesCard";
import { WorkoutTodayCard } from "@/components/dashboard/WorkoutTodayCard";
import { CalorieBalanceCard } from "@/components/dashboard/CalorieBalanceCard";
import { HealthChart } from "@/components/dashboard/HealthChart";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { SyncStatusCard } from "@/components/dashboard/SyncStatusCard";

function DateNav() {
  const [offset, setOffset] = useState(0);
  const isToday = offset === 0;
  const date = isToday ? new Date() : subDays(new Date(), Math.abs(offset));
  const label = isToday ? "Aujourd'hui" : format(date, "d MMMM", { locale: fr });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOffset((o) => o - 1)}
        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[110px] text-center">{label}</span>
      <button
        onClick={() => setOffset((o) => Math.min(o + 1, 0))}
        disabled={isToday}
        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
        <DateNav />
      </div>

      <SyncStatusCard />

      {/* Row 1 : Calories + Sommeil + Poids */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CaloriesCard />
        <KpiCard
          metricType="sleep_hours"
          label="Sommeil"
          unit="h"
          color="hsl(217, 91%, 60%)"
          icon={<Moon className="h-4 w-4" />}
        />
        <KpiCard
          metricType="weight"
          label="Poids"
          unit="kg"
          color="hsl(262, 83%, 58%)"
          icon={<Scale className="h-4 w-4" />}
          source="body_metrics"
          bodyField="weight_kg"
        />
      </div>

      {/* Row 2 : Steps + Workout + Protéines */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          metricType="steps"
          label="Pas"
          unit=""
          color="hsl(152, 60%, 48%)"
          icon={<Footprints className="h-4 w-4" />}
        />
        <WorkoutTodayCard />
        <KpiCard
          metricType="protein"
          label="Protéines"
          unit="g"
          color="hsl(172, 66%, 50%)"
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      {/* Row 3 : HRV + VO2Max + Masse Grasse */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard
          metricType="hrv"
          label="HRV"
          unit="ms"
          color="hsl(152, 60%, 48%)"
          icon={<Activity className="h-4 w-4" />}
        />
        <KpiCard
          metricType="vo2max"
          label="VO2Max"
          unit="ml/kg/min"
          color="hsl(172, 66%, 50%)"
          icon={<Wind className="h-4 w-4" />}
        />
        <KpiCard
          metricType="body_fat"
          label="Masse Grasse"
          unit="%"
          color="hsl(25, 95%, 53%)"
          icon={<Percent className="h-4 w-4" />}
          source="body_metrics"
          bodyField="body_fat_pc"
          invertDelta
        />
      </div>

      {/* Row 4 : Balance calorique + Semaine sportive */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <CalorieBalanceCard />
        <WeeklySummary />
      </div>

      {/* Row 5 : Chart historique */}
      <HealthChart />
    </div>
  );
}

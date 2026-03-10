import { Heart, Moon, Activity, Wind } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { HealthChart } from "@/components/dashboard/HealthChart";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { SyncBanner } from "@/components/dashboard/SyncBanner";
import { HrvTrendBadge } from "@/components/dashboard/HrvTrendBadge";
import { ReadinessScore } from "@/components/dashboard/ReadinessScore";

const kpiConfig = [
  { key: "hrv", label: "HRV", unit: "ms", icon: <Activity className="h-4 w-4" />, color: "hsl(152, 60%, 48%)" },
  { key: "sleep_score", label: "Sommeil", unit: "pts", icon: <Moon className="h-4 w-4" />, color: "hsl(217, 91%, 60%)" },
  { key: "rhr", label: "FC Repos", unit: "bpm", icon: <Heart className="h-4 w-4" />, color: "hsl(0, 84%, 60%)" },
  { key: "vo2max", label: "VO2Max", unit: "ml", icon: <Wind className="h-4 w-4" />, color: "hsl(172, 66%, 50%)" },
];

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Vue d'ensemble</h1>
        <HrvTrendBadge />
      </div>

      <SyncBanner />

      {/* KPI Cards + Readiness Score */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiConfig.map((kpi) => (
          <KpiCard
            key={kpi.key}
            metricType={kpi.key}
            label={kpi.label}
            unit={kpi.unit}
            color={kpi.color}
            icon={kpi.icon}
          />
        ))}
        <ReadinessScore />
      </div>

      {/* Main content: Chart (2fr) + Sidebar (1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        <HealthChart />
        <div className="flex flex-col gap-3">
          <WeeklySummary />
          <ActivityHeatmap />
        </div>
      </div>
    </div>
  );
}

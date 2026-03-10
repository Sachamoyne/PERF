import { Heart, Moon, Activity, Wind } from "lucide-react";
import { useLatestMetrics } from "@/hooks/useHealthData";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { HealthChart } from "@/components/dashboard/HealthChart";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { RecentActivities } from "@/components/dashboard/RecentActivities";
import { SyncBanner } from "@/components/dashboard/SyncBanner";
import { HrvTrendBadge } from "@/components/dashboard/HrvTrendBadge";
import { MetricsHistory } from "@/components/dashboard/MetricsHistory";
import { ReadinessScore } from "@/components/dashboard/ReadinessScore";

const kpiConfig = [
  { key: "hrv", label: "HRV", icon: <Activity className="h-4 w-4" />, color: "hsl(152, 60%, 48%)" },
  { key: "sleep_score", label: "Sommeil", icon: <Moon className="h-4 w-4" />, color: "hsl(217, 91%, 60%)" },
  { key: "rhr", label: "FC Repos", icon: <Heart className="h-4 w-4" />, color: "hsl(0, 84%, 60%)" },
  { key: "vo2max", label: "VO2Max", icon: <Wind className="h-4 w-4" />, color: "hsl(172, 66%, 50%)" },
];

export default function Dashboard() {
  const { data: metrics } = useLatestMetrics();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Vue d'ensemble</h1>
        <HrvTrendBadge />
      </div>

      <SyncBanner />

      {/* KPI Cards + Readiness Score */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiConfig.map((kpi) => {
          const m = metrics?.[kpi.key];
          return (
            <KpiCard
              key={kpi.key}
              label={kpi.label}
              value={m?.value ?? "—"}
              unit={m?.unit ?? ""}
              trend={m?.trend ?? []}
              color={kpi.color}
              icon={kpi.icon}
            />
          );
        })}
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

      <RecentActivities />
      <MetricsHistory />
    </div>
  );
}

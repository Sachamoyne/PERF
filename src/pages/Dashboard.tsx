import { Heart, Moon, Activity, Wind } from "lucide-react";
import { useLatestMetrics } from "@/hooks/useHealthMetrics";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ActivityHeatmap } from "@/components/dashboard/ActivityHeatmap";
import { RecentActivities } from "@/components/dashboard/RecentActivities";
import { SyncBanner } from "@/components/dashboard/SyncBanner";

const kpiConfig = [
  { key: "hrv", label: "HRV", icon: <Activity className="h-4 w-4" />, color: "hsl(152, 60%, 48%)" },
  { key: "sleep_score", label: "Sommeil", icon: <Moon className="h-4 w-4" />, color: "hsl(217, 91%, 60%)" },
  { key: "rhr", label: "FC Repos", icon: <Heart className="h-4 w-4" />, color: "hsl(0, 84%, 60%)" },
  { key: "vo2max", label: "VO2Max", icon: <Wind className="h-4 w-4" />, color: "hsl(172, 66%, 50%)" },
];

export default function Dashboard() {
  const { data: metrics } = useLatestMetrics();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>

      <SyncBanner />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      <ActivityHeatmap />
      <RecentActivities />
    </div>
  );
}

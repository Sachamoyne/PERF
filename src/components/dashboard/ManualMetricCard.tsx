import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ManualMetricType = "hrv" | "vo2max";

type MetricType = Database["public"]["Enums"]["metric_type"];

const PERIODS = [
  { label: "7j", days: 7 },
  { label: "1m", days: 30 },
  { label: "3m", days: 90 },
  { label: "1a", days: 365 },
] as const;

interface ManualMetricCardProps {
  metricType: ManualMetricType;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  targetValue?: number;
}

function useMetricHistory(metricType: ManualMetricType, days: number) {
  return useQuery({
    queryKey: ["kpi_metric", metricType, days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from("health_metrics")
        .select("value, date, unit")
        .eq("metric_type", metricType as MetricType)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

export function ManualMetricCard({ metricType, label, unit, color, icon, targetValue }: ManualMetricCardProps) {
  const [periodIdx, setPeriodIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso);
  const [value, setValue] = useState("");

  const { user } = useAuth();
  const queryClient = useQueryClient();

  const period = PERIODS[periodIdx];
  const { data: history = [] } = useMetricHistory(metricType, period.days);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("Valeur invalide");
      }

      const { error } = await supabase
        .from("health_metrics")
        .upsert(
          {
            user_id: user.id,
            date,
            metric_type: metricType,
            value: Math.round(parsed * 100) / 100,
            unit,
          },
          { onConflict: "user_id,metric_type,date" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health_metrics"] });
      queryClient.invalidateQueries({ queryKey: ["kpi_metric"] });
      queryClient.invalidateQueries({ queryKey: ["latest_metrics"] });
      toast.success(`${label} enregistré`);
      setOpen(false);
      setDate(todayIso());
      setValue("");
    },
    onError: (error) => {
      toast.error((error as Error).message || `Erreur lors de l'enregistrement ${label}`);
    },
  });

  const { displayValue, delta, deltaLabel, chartData, gradientId } = useMemo(() => {
    const gId = `gradient-manual-${metricType}`;
    if (history.length === 0) {
      return { displayValue: "—", delta: null as number | null, deltaLabel: "", chartData: [] as { v: number; i: number }[], gradientId: gId };
    }

    const values = history.map((d) => d.value);
    const latest = history[history.length - 1]?.value ?? 0;
    const avg = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
    const display = period.days === 7 ? latest : avg;

    let d: number | null = null;
    let dLabel = "";
    if (history.length >= 2) {
      d = Math.round((values[values.length - 1] - values[values.length - 2]) * 10) / 10;
      dLabel = d > 0 ? `+${d}` : `${d}`;
    }

    return {
      displayValue: Math.round(display * 10) / 10,
      delta: d,
      deltaLabel: dLabel,
      chartData: values.map((v, i) => ({ v, i })),
      gradientId: gId,
    };
  }, [history, period.days, metricType]);

  const progressPct = targetValue && typeof displayValue === "number"
    ? Math.min((displayValue / targetValue) * 100, 100)
    : null;

  return (
    <div className="glass-card p-3 flex flex-col justify-between overflow-hidden" style={{ minHeight: "140px" }}>
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </div>

        <div className="flex items-center gap-1">
          {delta !== null && delta !== 0 && (
            <div className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${delta > 0 ? "text-primary" : "text-destructive"}`}>
              {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {deltaLabel}
            </div>
          )}

          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="bg-card border-border">
              <DrawerHeader>
                <DrawerTitle className="font-display text-foreground">Ajouter {label}</DrawerTitle>
              </DrawerHeader>

              <div className="px-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="bg-secondary border-border"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Valeur ({unit})</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="bg-secondary border-border"
                    placeholder={`Ex: ${metricType === "hrv" ? "55" : "49.5"}`}
                  />
                </div>
              </div>

              <DrawerFooter>
                <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ backgroundColor: color }}>
                  {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <DrawerClose asChild>
                  <Button variant="ghost">Annuler</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      <div className="mt-1">
        <span className="text-xl font-display font-bold leading-none" style={{ color }}>
          {displayValue}
        </span>
        <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>
        {period.days > 7 && history.length > 0 && (
          <span className="text-[9px] text-muted-foreground ml-1">(moy.)</span>
        )}
      </div>

      {progressPct !== null && (
        <div className="mt-2">
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progressPct}%`, backgroundColor: color }} />
          </div>
        </div>
      )}

      <div className="h-[36px] w-full mt-1 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradientId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-0.5 mt-1">
        {PERIODS.map((p, idx) => (
          <button
            key={p.label}
            onClick={() => setPeriodIdx(idx)}
            className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium transition-colors ${
              idx === periodIdx
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

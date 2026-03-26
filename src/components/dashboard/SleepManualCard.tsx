import { useEffect, useMemo, useState } from "react";
import { Moon, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Drawer, DrawerClose, DrawerContent,
  DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useInsertSleepLog } from "@/hooks/useSleepLogs";
import { usePersistedChartPeriod } from "@/hooks/usePersistedChartPeriod";
import { supabase } from "@/integrations/supabase/client";

const SLEEP_COLOR = "hsl(217, 91%, 60%)";
const SCORE_COLOR = "hsl(152, 60%, 48%)";

const PERIODS = [
  { label: "7j",  days: 7   },
  { label: "1m",  days: 30  },
  { label: "3m",  days: 90  },
  { label: "1a",  days: 365 },
] as const;

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateStr(d);
}

function formatDuration(hours: number | null | undefined) {
  if (hours == null || Number.isNaN(hours)) return "—";
  return `${Math.round(hours * 10) / 10} h`;
}

function formatTimeRange(bedtime?: string | null, wakeTime?: string | null) {
  if (!bedtime || !wakeTime) return "";
  return `${bedtime.slice(0, 5)} → ${wakeTime.slice(0, 5)}`;
}

function calculateSleepDuration(bedtime: string, wakeTime: string): number | null {
  const [bedH, bedM] = bedtime.split(":").map(Number);
  const [wakeH, wakeM] = wakeTime.split(":").map(Number);
  if ([bedH, bedM, wakeH, wakeM].some((v) => Number.isNaN(v))) return null;
  const bedMins = bedH * 60 + bedM;
  const wakeMins = wakeH * 60 + wakeM;
  let diff = wakeMins - bedMins;
  if (diff <= 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

function scoreClasses(score: number | null) {
  if (score == null) return "text-muted-foreground border-border";
  if (score >= 70) return "text-primary border-primary/40 bg-primary/10";
  if (score >= 50) return "text-amber-400 border-amber-400/40 bg-amber-400/10";
  return "text-destructive border-destructive/40 bg-destructive/10";
}

function aggregateByMonth(data: { duration_hours: number; score: number | null; date: string }[]) {
  const byMonth: Record<string, { hours: number[]; scores: number[] }> = {};
  for (const e of data) {
    const key = e.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { hours: [], scores: [] };
    byMonth[key].hours.push(e.duration_hours);
    if (e.score != null) byMonth[key].scores.push(e.score);
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [y, m] = key.split("-");
      const lbl = new Date(Number(y), Number(m)-1, 1)
        .toLocaleDateString("fr-FR", { month: "short" });
      return {
        label: lbl,
        date: key + "-01",
        hours: Math.round((v.hours.reduce((s, x) => s + x, 0) / v.hours.length) * 10) / 10,
        score: v.scores.length > 0
          ? Math.round(v.scores.reduce((s, x) => s + x, 0) / v.scores.length)
          : null,
      };
    });
}

function useSleepHistory(days: number) {
  return useQuery({
    queryKey: ["sleep_history", days],
    staleTime: 0,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = toLocalDateStr(since);
      const { data, error } = await supabase
        .from("sleep_logs")
        .select("date, duration_hours, score, bedtime, wake_time")
        .gte("date", sinceStr)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter(d => d.duration_hours != null) as {
        date: string;
        duration_hours: number;
        score: number | null;
        bedtime: string | null;
        wake_time: string | null;
      }[];
    },
  });
}

export function SleepManualCard({ date, detailPath }: { date?: string; detailPath?: string }) {
  const navigate = useNavigate();
  const [periodIdx, setPeriodIdx] = usePersistedChartPeriod("sleep", PERIODS);
  const [open, setOpen] = useState(false);
  const [dateValue, setDateValue] = useState(getYesterdayDate);
  const [bedtime, setBedtime] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [score, setScore] = useState(75);
  const [notes, setNotes] = useState("");

  const period = PERIODS[periodIdx];
  const isMonthly = period.days >= 90;
  const { data: history = [] } = useSleepHistory(period.days);
  const insertSleepLog = useInsertSleepLog();

  useEffect(() => {
    if (date) setDateValue(date);
  }, [date]);

  const durationHours = useMemo(
    () => calculateSleepDuration(bedtime, wakeTime),
    [bedtime, wakeTime]
  );

  // Entrée la plus récente pour le snapshot
  const latest = history.length > 0 ? history[history.length - 1] : null;

  // Données graphique
  const dailyData = history.map(e => ({
    label: format(new Date(e.date + "T12:00:00"), "d MMM", { locale: fr }),
    date: e.date,
    hours: e.duration_hours,
    score: e.score,
  }));

  const monthlyData = aggregateByMonth(history);
  const chartData = isMonthly ? monthlyData : dailyData;

  // Bornes Y heures (gauche) et score (droite)
  const allHours = chartData.map(d => d.hours).filter(Boolean) as number[];
  const minH = allHours.length > 0 ? Math.min(...allHours) : 0;
  const maxH = allHours.length > 0 ? Math.max(...allHours) : 10;
  const padH = Math.max((maxH - minH) * 0.2, 0.5);
  const yMinH = Math.max(0, Math.floor(minH - padH));
  const yMaxH = Math.ceil(maxH + padH);

  const handleSubmit = () => {
    if (!durationHours) {
      toast.error("Renseigne une heure de coucher et de réveil valides");
      return;
    }
    insertSleepLog.mutate(
      { date: dateValue, bedtime, wake_time: wakeTime, duration_hours: durationHours, score, notes: notes.trim() || null },
      {
        onSuccess: () => {
          toast.success("Sommeil enregistré");
          setOpen(false);
          setDateValue(getYesterdayDate());
          setBedtime("23:30");
          setWakeTime("07:00");
          setScore(75);
          setNotes("");
        },
        onError: () => toast.error("Impossible d'enregistrer ce sommeil"),
      }
    );
  };

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "11px",
    padding: "6px 10px",
  };
  const axisStyle = { fontSize: 9, fill: "hsl(var(--muted-foreground))" };

  return (
    <div className="glass-card p-3 flex flex-col gap-2" style={{ minHeight: "220px" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Moon className="h-4 w-4" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (detailPath) navigate(detailPath);
            }}
            className={`transition-colors ${detailPath ? "cursor-pointer hover:text-foreground hover:underline" : ""}`}
          >
            Sommeil
          </button>
        </div>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <button className="h-5 w-5 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DrawerTrigger>
          <DrawerContent className="bg-card border-border">
            <DrawerHeader>
              <DrawerTitle className="font-display text-foreground">Saisir ton sommeil</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Date</Label>
                <Input type="date" value={dateValue} onChange={e => setDateValue(e.target.value)} className="bg-secondary border-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Coucher</Label>
                  <Input type="time" value={bedtime} onChange={e => setBedtime(e.target.value)} className="bg-secondary border-border" />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Réveil</Label>
                  <Input type="time" value={wakeTime} onChange={e => setWakeTime(e.target.value)} className="bg-secondary border-border" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Durée calculée</Label>
                <Input value={formatDuration(durationHours)} readOnly className="bg-secondary border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">Score</Label>
                  <span className="text-xs text-muted-foreground">{score}/99</span>
                </div>
                <Slider value={[score]} onValueChange={v => setScore(v[0] ?? 0)} min={0} max={99} step={1} />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Notes (optionnel)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Réveils, ressenti..." className="bg-secondary border-border min-h-[80px]" />
              </div>
            </div>
            <DrawerFooter>
              <Button onClick={handleSubmit} disabled={insertSleepLog.isPending} style={{ backgroundColor: SLEEP_COLOR }} className="text-white">
                {insertSleepLog.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <DrawerClose asChild><Button variant="ghost">Annuler</Button></DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Valeur + snapshot */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-2xl font-display font-bold" style={{ color: SLEEP_COLOR }}>
            {latest ? formatDuration(latest.duration_hours) : "—"}
          </span>
          {latest?.bedtime && latest?.wake_time && (
            <span className="text-[10px] text-muted-foreground ml-2">
              {formatTimeRange(latest.bedtime, latest.wake_time)}
            </span>
          )}
        </div>
        {latest?.score != null && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${scoreClasses(latest.score)}`}>
            Score {latest.score}/99
          </span>
        )}
      </div>

      {/* Graphique */}
      <div className="flex-1" style={{ minHeight: "110px" }}>
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-muted-foreground">
            Aucune donnée
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={false} axisLine={false} tickLine={false} height={0} />
              <YAxis
                yAxisId="hours"
                orientation="left"
                domain={[yMinH, yMaxH]}
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                width={28}
                unit="h"
              />
              <YAxis
                yAxisId="score"
                orientation="right"
                domain={[0, 99]}
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                tickCount={4}
                width={28}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) =>
                  name === "hours"
                    ? [`${value} h`, "Sommeil"]
                    : [`${value}/99`, "Score"]
                }
                labelFormatter={(_, payload) => {
                  const d = payload?.[0]?.payload?.date;
                  return d ? format(new Date(d + "T12:00:00"), "d MMMM yyyy", { locale: fr }) : "";
                }}
              />
              <Bar
                yAxisId="hours"
                dataKey="hours"
                fill={SLEEP_COLOR}
                fillOpacity={0.7}
                radius={[3, 3, 0, 0]}
                maxBarSize={30}
              />
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="score"
                stroke={SCORE_COLOR}
                strokeWidth={2}
                dot={history.length <= 30 ? { fill: SCORE_COLOR, r: 2, strokeWidth: 0 } : false}
                activeDot={{ r: 4, fill: SCORE_COLOR, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Légende + période */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm opacity-70" style={{ backgroundColor: SLEEP_COLOR }} />
            Heures
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ backgroundColor: SCORE_COLOR }} />
            Score
          </span>
        </div>
        <div className="flex gap-0.5">
          {PERIODS.map((p, idx) => (
            <button
              key={p.label}
              onClick={() => setPeriodIdx(idx)}
              className={`text-[9px] px-1.5 py-0.5 rounded-sm font-medium transition-colors ${
                idx === periodIdx ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useActivities } from "@/hooks/useActivities";
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  format,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import { MapPin, Mountain, Wind, TrendingUp, TrendingDown, Clock, ArrowUp, Footprints, ChevronRight, Trophy, Pencil } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Period = "week" | "month" | "year";
type SportType = "cycling" | "swimming";
type ActivityRow = Tables<"activities">;
type RecordRow = Tables<"running_records">;

const periodLabels: Record<Period, string> = { week: "Semaine", month: "Mois", year: "Année" };

interface RecordDef {
  key: string;
  label: string;
  kind: "time" | "distance";
}

interface EnduranceSportPageProps {
  title: string;
  sportType: SportType;
  themeColor: string;
  accentColor: string;
  records: RecordDef[];
}

function isValidTimeRecord(v: string) {
  const trimmed = v.trim();
  return /^(\d{1,2}:)?[0-5]\d:[0-5]\d$/.test(trimmed);
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(2)} km`;
  return `${Math.round(distanceMeters)} m`;
}

function computeSpeedKmh(durationSec: number, distanceMeters: number): string {
  if (!durationSec || !distanceMeters) return "—";
  const h = durationSec / 3600;
  if (h <= 0) return "—";
  return `${((distanceMeters / 1000) / h).toFixed(1)} km/h`;
}

function computePacePer100m(durationSec: number, distanceMeters: number): string {
  if (!durationSec || !distanceMeters) return "—";
  const secPer100m = durationSec / (distanceMeters / 100);
  if (!Number.isFinite(secPer100m) || secPer100m <= 0) return "—";
  const min = Math.floor(secPer100m / 60);
  const sec = Math.round(secPer100m % 60);
  return `${min}:${String(sec).padStart(2, "0")} /100m`;
}

function PeriodSelector({ value, onChange, themeColor }: { value: Period; onChange: (p: Period) => void; themeColor: string }) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
      {(Object.keys(periodLabels) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${value === p ? "text-white" : "text-muted-foreground hover:text-foreground"}`}
          style={value === p ? { backgroundColor: themeColor } : undefined}
        >
          {periodLabels[p]}
        </button>
      ))}
    </div>
  );
}

type ChartEntry = {
  label: string;
  dateLabel: string;
  distanceKm: number;
  hasActivity: boolean;
  id: string | null;
  monthIndex?: number;
};

function useSportRecords(sportType: SportType) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sport_records", sportType, user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [] as RecordRow[];
      const { data, error } = await supabase
        .from("running_records")
        .select("*")
        .eq("user_id", user.id)
        .like("distance_label", `${sportType}:%`)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });
}

function useUpsertSportRecord(sportType: SportType) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (values: { key: string; value: string; date?: string | null; notes?: string | null }) => {
      if (!user) throw new Error("Not authenticated");
      const payload = {
        user_id: user.id,
        distance_label: `${sportType}:${values.key}`,
        value: values.value,
        date: values.date ?? null,
        notes: values.notes ?? null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("running_records")
        .upsert(payload, { onConflict: "user_id,distance_label" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sport_records", sportType] });
    },
  });
}

export function EnduranceSportPage({
  title,
  sportType,
  themeColor,
  accentColor,
  records: recordDefs,
}: EnduranceSportPageProps) {
  const { user } = useAuth();
  const { data: allActivities = [] } = useActivities(sportType);
  const { data: records = [] } = useSportRecords(sportType);
  const upsertRecord = useUpsertSportRecord(sportType);
  const [period, setPeriod] = useState<Period>("month");
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [activeRecordDef, setActiveRecordDef] = useState<RecordDef | null>(null);
  const [recordValue, setRecordValue] = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [recordNotes, setRecordNotes] = useState("");

  const { data: vo2Data } = useQuery({
    queryKey: ["vo2max_latest", user?.id, sportType],
    enabled: sportType === "cycling" && !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("health_metrics")
        .select("value, date")
        .eq("user_id", user.id)
        .eq("metric_type", "vo2max")
        .order("date", { ascending: false })
        .limit(2);
      return data ?? [];
    },
  });

  const handlePeriodChange = (nextPeriod: Period) => {
    setPeriod(nextPeriod);
    setSelectedActivityId(null);
    setSelectedMonth(null);
    setExpandedActivityId(null);
  };

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

  const filteredActivities = useMemo(
    () => allActivities.filter((activity) => {
      const activityDate = new Date(activity.start_time);
      return activityDate >= periodRange.start && activityDate <= periodRange.end;
    }),
    [allActivities, periodRange]
  );

  const totalDistMeters = filteredActivities.reduce((sum, activity) => sum + (activity.distance_meters || 0), 0);
  const totalDurSec = filteredActivities.reduce((sum, activity) => sum + activity.duration_sec, 0);

  const vo2Value = vo2Data?.[0]?.value;
  const vo2Prev = vo2Data?.[1]?.value;
  const vo2Trend = vo2Value && vo2Prev ? vo2Value - vo2Prev : 0;

  const chartData: ChartEntry[] = useMemo(() => {
    const dedupeActivities = (activities: ActivityRow[]) => {
      const seen = new Set<string>();
      return activities.filter((activity) => {
        const start = typeof activity.start_time === "string" ? activity.start_time : "";
        const minuteKey = start ? start.slice(0, 16) : "";
        const distKey = Math.round((activity.distance_meters || 0) / 10) * 10;
        const durKey = Math.round((activity.duration_sec || 0) / 5) * 5;
        const key = `${minuteKey}|${distKey}|${durKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    if (period === "year") {
      const months = eachMonthOfInterval({ start: periodRange.start, end: periodRange.end });
      return months.map((month) => {
        const monthActivities = allActivities.filter((activity) => {
          const d = new Date(activity.start_time);
          return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
        });
        const uniqueMonthActivities = dedupeActivities(monthActivities);
        const km = uniqueMonthActivities.reduce((s, activity) => s + (activity.distance_meters || 0), 0) / 1000;
        return {
          label: format(month, "MMM", { locale: fr }),
          dateLabel: format(month, "MMMM yyyy", { locale: fr }),
          distanceKm: Math.round(km * 10) / 10,
          hasActivity: uniqueMonthActivities.length > 0,
          id: uniqueMonthActivities.length > 0 ? uniqueMonthActivities[0].id : null,
          monthIndex: month.getMonth(),
        };
      });
    }

    const days = eachDayOfInterval({ start: periodRange.start, end: periodRange.end });
    return days.map((day) => {
      const dayActivities = allActivities.filter((activity) => {
        const d = new Date(activity.start_time);
        return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
      });
      const uniqueDayActivities = dedupeActivities(dayActivities);
      const km = uniqueDayActivities.reduce((s, activity) => s + (activity.distance_meters || 0), 0) / 1000;
      return {
        label: period === "week" ? format(day, "EEE", { locale: fr }) : format(day, "d"),
        dateLabel: format(day, "EEEE d MMMM", { locale: fr }),
        distanceKm: Math.round(km * 10) / 10,
        hasActivity: uniqueDayActivities.length > 0,
        id: uniqueDayActivities.length > 0 ? uniqueDayActivities[0].id : null,
      };
    });
  }, [allActivities, period, periodRange]);

  const displayMonth = selectedMonth ?? new Date().getMonth();
  const monthActivities = useMemo(() => {
    if (period !== "year") return [] as ActivityRow[];
    const year = new Date().getFullYear();
    return allActivities
      .filter((activity) => {
        const d = new Date(activity.start_time);
        return d.getFullYear() === year && d.getMonth() === displayMonth;
      })
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [allActivities, period, displayMonth]);

  const displayMonthLabel = useMemo(() => {
    const d = new Date(new Date().getFullYear(), displayMonth, 1);
    return format(d, "MMMM yyyy", { locale: fr });
  }, [displayMonth]);

  const displayActivityId = selectedActivityId ?? (filteredActivities.length > 0 ? filteredActivities[0].id : null);
  const selectedActivity = displayActivityId ? allActivities.find((activity) => activity.id === displayActivityId) : null;
  const expandedActivity = expandedActivityId ? allActivities.find((activity) => activity.id === expandedActivityId) : null;
  const activeMonthIndex = period === "year" ? displayMonth : null;

  const openRecordEditor = (recordDef: RecordDef) => {
    const current = records.find((record) => record.distance_label === `${sportType}:${recordDef.key}`);
    setActiveRecordDef(recordDef);
    if (recordDef.kind === "distance") {
      const numeric = Number(String(current?.value ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
      setRecordValue(Number.isFinite(numeric) && numeric > 0 ? String(numeric) : "");
    } else {
      setRecordValue(current?.value ?? "");
    }
    setRecordDate(current?.date ?? "");
    setRecordNotes(current?.notes ?? "");
    setRecordOpen(true);
  };

  const handleSaveRecord = () => {
    if (!activeRecordDef) return;
    const rawValue = recordValue.trim();
    if (!rawValue) {
      toast.error(activeRecordDef.kind === "distance" ? "Distance obligatoire" : "Temps obligatoire");
      return;
    }

    let normalizedValue = rawValue;
    if (activeRecordDef.kind === "time") {
      if (!isValidTimeRecord(rawValue)) {
        toast.error("Format temps invalide (MM:SS ou HH:MM:SS)");
        return;
      }
    } else {
      const km = Number(rawValue.replace(",", "."));
      if (!Number.isFinite(km) || km <= 0) {
        toast.error("Distance invalide");
        return;
      }
      normalizedValue = `${Math.round(km * 10) / 10} km`;
    }

    upsertRecord.mutate(
      {
        key: activeRecordDef.key,
        value: normalizedValue,
        date: recordDate || null,
        notes: recordNotes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Record enregistré");
          setRecordOpen(false);
        },
        onError: (error) => {
          toast.error((error as Error).message || "Impossible d'enregistrer le record");
        },
      }
    );
  };

  const onBarClick = (e: { activePayload?: Array<{ payload: ChartEntry }> } | undefined) => {
    const payload = e?.activePayload?.[0]?.payload;
    if (!payload?.hasActivity) return;
    if (period === "year" && payload.monthIndex !== undefined) {
      setSelectedMonth(payload.monthIndex);
      setExpandedActivityId(null);
    } else if (payload.id) {
      setSelectedActivityId(payload.id);
    }
  };

  const detailPace = (activity: ActivityRow) => (
    sportType === "cycling"
      ? computeSpeedKmh(activity.duration_sec, activity.distance_meters || 0)
      : computePacePer100m(activity.duration_sec, activity.distance_meters || 0)
  );

  const avgSwimmingPace = sportType === "swimming"
    ? computePacePer100m(totalDurSec, totalDistMeters)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">{title}</h1>
        <PeriodSelector value={period} onChange={handlePeriodChange} themeColor={themeColor} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${themeColor}25` }}>
            <MapPin className="h-5 w-5" style={{ color: themeColor }} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">
              {sportType === "swimming"
                ? (totalDistMeters >= 1000
                  ? `${(totalDistMeters / 1000).toFixed(1)} `
                  : `${Math.round(totalDistMeters)} `)
                : `${(totalDistMeters / 1000).toFixed(1)} `}
              <span className="text-sm font-normal text-muted-foreground">{sportType === "swimming" && totalDistMeters < 1000 ? "m" : "km"}</span>
            </p>
            <p className="text-xs text-muted-foreground">Distance totale</p>
          </div>
        </div>

        <div className="glass-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: `${themeColor}25` }}>
            <Clock className="h-5 w-5" style={{ color: themeColor }} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-foreground">
              {formatDuration(totalDurSec)}
            </p>
            <p className="text-xs text-muted-foreground">Durée totale</p>
          </div>
        </div>

        {sportType === "cycling" ? (
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}25` }}>
              <Wind className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-display font-bold text-foreground">
                {vo2Value ?? "—"} <span className="text-sm font-normal text-muted-foreground">ml/kg/min</span>
              </p>
              {vo2Trend !== 0 && (
                <span className={`flex items-center text-xs ${vo2Trend > 0 ? "text-primary" : "text-destructive"}`}>
                  {vo2Trend > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                  {vo2Trend > 0 ? "+" : ""}{vo2Trend.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-card p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}25` }}>
              <Footprints className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <div>
              <p className="text-2xl font-display font-bold text-foreground">
                {avgSwimmingPace ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Allure moyenne</p>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-foreground mb-4">
          {period === "year" ? "Distance par mois" : "Distance par jour"}
        </h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              onClick={onBarClick}
              barCategoryGap={period === "week" ? "30%" : "20%"}
            >
              <defs>
                <linearGradient id={`${sportType}Gradient`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={themeColor} stopOpacity={1} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                interval={period === "month" ? 4 : 0}
                tickFormatter={(value: string) => (period === "year" ? value?.charAt(0).toUpperCase() : value)}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} unit=" km" tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number) => [value > 0 ? `${value} km` : "Repos", "Distance"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.dateLabel ?? ""}
                cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }}
              />
              <Bar dataKey="distanceKm" radius={[3, 3, 0, 0]} cursor="pointer" maxBarSize={period === "week" ? 40 : period === "month" ? 16 : 28}>
                {chartData.map((entry) => (
                  <Cell
                    key={`${entry.label}-${entry.dateLabel}`}
                    fill={
                      !entry.hasActivity
                        ? "hsl(var(--muted))"
                        : period === "year" && entry.monthIndex === activeMonthIndex
                          ? accentColor
                          : period !== "year" && entry.id === displayActivityId
                            ? accentColor
                            : `url(#${sportType}Gradient)`
                    }
                    opacity={
                      period === "year"
                        ? (activeMonthIndex !== null && entry.monthIndex !== activeMonthIndex ? 0.4 : entry.hasActivity ? 1 : 0.3)
                        : (displayActivityId && entry.id !== displayActivityId ? 0.4 : entry.hasActivity ? 1 : 0.3)
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {allActivities.length === 0 ? (
        <div className="glass-card p-6 flex items-center justify-center text-muted-foreground text-sm animate-fade-in">
          <Footprints className="h-4 w-4 mr-2 opacity-50" />
          Aucune séance enregistrée
        </div>
      ) : period === "year" ? (
        <YearMonthDetail
          monthLabel={displayMonthLabel}
          activities={monthActivities}
          expandedActivityId={expandedActivityId}
          onExpandActivity={setExpandedActivityId}
          expandedActivity={expandedActivity}
          sportType={sportType}
          themeColor={themeColor}
        />
      ) : selectedActivity ? (
        <div
          key={selectedActivity.id}
          className="glass-card p-5 border-l-4 animate-fade-in"
          style={{ borderLeftColor: themeColor }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              Détail — {format(new Date(selectedActivity.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
            </h3>
            <button onClick={() => setSelectedActivityId(null)} className="text-muted-foreground hover:text-foreground text-sm">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <DetailStat icon={<MapPin className="h-4 w-4" style={{ color: themeColor }} />} label="Distance" value={formatDistance(selectedActivity.distance_meters || 0)} />
            <DetailStat icon={<Clock className="h-4 w-4" style={{ color: themeColor }} />} label="Durée" value={formatDuration(selectedActivity.duration_sec)} />
            <DetailStat icon={<Footprints className="h-4 w-4" style={{ color: themeColor }} />} label="Allure moy." value={detailPace(selectedActivity)} />
            {sportType === "cycling" && (
              <DetailStat icon={<Mountain className="h-4 w-4" style={{ color: themeColor }} />} label="Dénivelé" value={`${(selectedActivity.total_elevation_gain || 0).toFixed(0)} m`} />
            )}
            <DetailStat icon={<ArrowUp className="h-4 w-4 text-muted-foreground" />} label="Calories" value={selectedActivity.calories ? `${selectedActivity.calories} kcal` : "—"} />
          </div>
        </div>
      ) : (
        <div className="glass-card p-6 flex items-center justify-center text-muted-foreground text-sm animate-fade-in">
          <Footprints className="h-4 w-4 mr-2 opacity-50" />
          Sélectionnez une activité sur le graphique pour voir les détails
        </div>
      )}

      <div className="glass-card p-5 border-l-4" style={{ borderLeftColor: themeColor }}>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4" style={{ color: themeColor }} />
          <h3 className="font-display font-semibold text-foreground">Records personnels</h3>
        </div>

        <div className={`grid gap-3 ${recordDefs.length >= 4 ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
          {recordDefs.map((recordDef) => {
            const record = records.find((r) => r.distance_label === `${sportType}:${recordDef.key}`);
            return (
              <div key={recordDef.key} className="rounded-xl border border-border p-3 bg-card/40">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Trophy className="h-3.5 w-3.5 shrink-0" style={{ color: themeColor }} />
                    <span className="text-xs text-muted-foreground truncate">{recordDef.label}</span>
                  </div>
                  <Drawer open={recordOpen && activeRecordDef?.key === recordDef.key} onOpenChange={(open) => {
                    setRecordOpen(open);
                    if (!open) setActiveRecordDef(null);
                  }}>
                    <DrawerTrigger asChild>
                      <button
                        onClick={() => openRecordEditor(recordDef)}
                        className="h-6 w-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </DrawerTrigger>
                    <DrawerContent className="bg-card border-border">
                      <DrawerHeader>
                        <DrawerTitle className="font-display text-foreground">Modifier {recordDef.label}</DrawerTitle>
                      </DrawerHeader>
                      <div className="px-4 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">{recordDef.kind === "distance" ? "Distance (km)" : "Temps"}</Label>
                          <Input
                            type={recordDef.kind === "distance" ? "number" : "text"}
                            step={recordDef.kind === "distance" ? "0.1" : undefined}
                            placeholder={recordDef.kind === "distance" ? "34.2" : "22:34 ou 01:22:34"}
                            value={recordValue}
                            onChange={(event) => setRecordValue(event.target.value)}
                            className="bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Date</Label>
                          <Input
                            type="date"
                            value={recordDate}
                            onChange={(event) => setRecordDate(event.target.value)}
                            className="bg-secondary border-border"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Notes (optionnel)</Label>
                          <Textarea
                            value={recordNotes}
                            onChange={(event) => setRecordNotes(event.target.value)}
                            className="bg-secondary border-border min-h-[80px]"
                          />
                        </div>
                      </div>
                      <DrawerFooter>
                        <Button
                          onClick={handleSaveRecord}
                          disabled={upsertRecord.isPending}
                          style={{ backgroundColor: themeColor }}
                          className="text-white"
                        >
                          {upsertRecord.isPending ? "Enregistrement..." : "Enregistrer"}
                        </Button>
                        <DrawerClose asChild>
                          <Button variant="ghost">Annuler</Button>
                        </DrawerClose>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>
                </div>

                <div className="text-lg font-display font-bold text-foreground">
                  {record?.value ?? "—"}
                </div>
                {record?.date && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(record.date), "d MMM yyyy", { locale: fr })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
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

function YearMonthDetail({
  monthLabel,
  activities,
  expandedActivityId,
  onExpandActivity,
  expandedActivity,
  sportType,
  themeColor,
}: {
  monthLabel: string;
  activities: ActivityRow[];
  expandedActivityId: string | null;
  onExpandActivity: (id: string | null) => void;
  expandedActivity: ActivityRow | undefined;
  sportType: SportType;
  themeColor: string;
}) {
  const paceLabel = sportType === "cycling" ? "Vitesse" : "Allure";

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="glass-card p-5 border-l-4" style={{ borderLeftColor: themeColor }}>
        <h3 className="font-display font-semibold text-foreground mb-4 capitalize">
          Activités de {monthLabel}
        </h3>

        {activities.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Footprints className="h-4 w-4 mr-2 opacity-50" />
            Aucune séance enregistrée
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs font-medium text-muted-foreground">Date</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Distance</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">{paceLabel}</TableHead>
                  {sportType === "cycling" && <TableHead className="text-xs font-medium text-muted-foreground">D+</TableHead>}
                  <TableHead className="text-xs font-medium text-muted-foreground">Durée</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity, index) => (
                  <TableRow
                    key={activity.id}
                    onClick={() => onExpandActivity(expandedActivityId === activity.id ? null : activity.id)}
                    className={`cursor-pointer transition-colors ${
                      index % 2 === 0 ? "bg-background" : "bg-muted/10"
                    } ${expandedActivityId === activity.id ? "hover:bg-muted/30" : "hover:bg-muted/30"}`}
                  >
                    <TableCell className="text-sm font-medium text-foreground py-3">
                      {format(new Date(activity.start_time), "EEE d MMM", { locale: fr })}
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {formatDistance(activity.distance_meters || 0)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground py-3">
                      {sportType === "cycling"
                        ? computeSpeedKmh(activity.duration_sec, activity.distance_meters || 0)
                        : computePacePer100m(activity.duration_sec, activity.distance_meters || 0)}
                    </TableCell>
                    {sportType === "cycling" && (
                      <TableCell className="text-sm text-foreground py-3">
                        {(activity.total_elevation_gain || 0).toFixed(0)} m
                      </TableCell>
                    )}
                    <TableCell className="text-sm text-foreground py-3">
                      {formatDuration(activity.duration_sec)}
                    </TableCell>
                    <TableCell className="py-3">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedActivityId === activity.id ? "rotate-90" : ""}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {expandedActivity && (
        <div key={expandedActivity.id} className="glass-card p-5 border-l-4 animate-fade-in" style={{ borderLeftColor: themeColor }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground">
              Détail — {format(new Date(expandedActivity.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
            </h3>
            <button onClick={() => onExpandActivity(null)} className="text-muted-foreground hover:text-foreground text-sm">
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <DetailStat icon={<MapPin className="h-4 w-4" style={{ color: themeColor }} />} label="Distance" value={formatDistance(expandedActivity.distance_meters || 0)} />
            <DetailStat icon={<Clock className="h-4 w-4" style={{ color: themeColor }} />} label="Durée" value={formatDuration(expandedActivity.duration_sec)} />
            <DetailStat
              icon={<Footprints className="h-4 w-4" style={{ color: themeColor }} />}
              label="Allure moy."
              value={sportType === "cycling"
                ? computeSpeedKmh(expandedActivity.duration_sec, expandedActivity.distance_meters || 0)
                : computePacePer100m(expandedActivity.duration_sec, expandedActivity.distance_meters || 0)}
            />
            {sportType === "cycling" && (
              <DetailStat icon={<Mountain className="h-4 w-4" style={{ color: themeColor }} />} label="Dénivelé" value={`${(expandedActivity.total_elevation_gain || 0).toFixed(0)} m`} />
            )}
            <DetailStat icon={<ArrowUp className="h-4 w-4 text-muted-foreground" />} label="Calories" value={expandedActivity.calories ? `${expandedActivity.calories} kcal` : "—"} />
          </div>
        </div>
      )}
    </div>
  );
}

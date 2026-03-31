import { useEffect, useMemo, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
} from "date-fns";
import { fr } from "date-fns/locale";
import {
  Check,
  Flame,
  Minus,
  Plus,
  Scale,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useActivities } from "@/hooks/useHealthData";
import { useLatestBodyMetric, useBodyMetrics } from "@/hooks/useBodyMetrics";
import {
  useWorkoutSessions,
  useAddWorkoutSet,
  useDeleteWorkoutSet,
  useGetOrCreateSessionForActivity,
  useLastPerformance,
  type WorkoutSetRow,
} from "@/hooks/useWorkoutSessions";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Period = "week" | "month" | "year";
type ExerciseDraft = { reps: string; weight: string; open: boolean };

type LastPerfRow = WorkoutSetRow & {
  workout_sessions?: { date?: string } | { date?: string }[] | null;
};

type StrengthChartPoint = {
  label: string;
  fullLabel: string;
  date: string;
  duration: number;
};

const periodLabels: Record<Period, string> = { week: "Semaine", month: "Mois", year: "Année" };

const FREQUENT_EXERCISES = [
  "Squat",
  "Bench Press",
  "Soulevé de terre",
  "Overhead Press",
  "Tractions",
  "Curl biceps",
  "Triceps poulie",
  "Leg press",
] as const;

const PROGRESSION_EXERCISES = [
  "Squat",
  "Bench Press",
  "Soulevé de terre",
  "Overhead Press",
  "Tractions",
  "Curl biceps",
  "Triceps poulie",
  "Leg press",
] as const;

export default function Strength() {
  const { data: appleActivities = [] } = useActivities("strength");
  const { data: latestMetrics = [] } = useLatestBodyMetric();
  const { data: bodyHistory = [] } = useBodyMetrics(30);
  const { data: workoutSessions = [] } = useWorkoutSessions();
  const getOrCreateSessionForActivity = useGetOrCreateSessionForActivity();

  const [period, setPeriod] = useState<Period>("month");
  const [selectedActivity, setSelectedActivity] = useState<(typeof appleActivities)[number] | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const latest = latestMetrics[0];
  const previous = latestMetrics[1];

  const weightDelta = latest && previous && latest.weight_kg && previous.weight_kg
    ? (latest.weight_kg - previous.weight_kg).toFixed(1)
    : null;
  const fatDelta = latest && previous && latest.body_fat_pc && previous.body_fat_pc
    ? (latest.body_fat_pc - previous.body_fat_pc).toFixed(1)
    : null;

  const bodyChartData = bodyHistory
    .filter((m) => m.weight_kg || m.muscle_mass_kg)
    .map((m) => ({
      date: m.date,
      Poids: m.weight_kg,
      Muscle: m.muscle_mass_kg,
    }));

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

  const chartData: StrengthChartPoint[] = useMemo(() => {
    if (period === "year") {
      const months = eachMonthOfInterval({ start: periodRange.start, end: periodRange.end });
      return months.map((month) => {
        const duration = appleActivities
          .filter((a) => {
            const d = new Date(a.start_time);
            return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
          })
          .reduce((sum, a) => sum + (a.duration_sec / 60), 0);

        return {
          label: format(month, "MMM", { locale: fr }),
          fullLabel: format(month, "MMMM yyyy", { locale: fr }),
          date: format(month, "yyyy-MM-01"),
          duration: Math.round(duration),
        };
      });
    }

    const days = eachDayOfInterval({ start: periodRange.start, end: periodRange.end });
    return days.map((day) => {
      const dayIso = format(day, "yyyy-MM-dd");
      const duration = appleActivities
        .filter((a) => a.start_time.slice(0, 10) === dayIso)
        .reduce((sum, a) => sum + (a.duration_sec / 60), 0);

      return {
        label: period === "week" ? format(day, "EEE", { locale: fr }) : format(day, "d"),
        fullLabel: format(day, "EEEE d MMMM yyyy", { locale: fr }),
        date: dayIso,
        duration: Math.round(duration),
      };
    });
  }, [appleActivities, period, periodRange]);

  const linkedSession = selectedActivity
    ? workoutSessions.find((s) => s.activity_id === selectedActivity.id)
    : undefined;
  const linkedSessionId = linkedSession?.id ?? null;

  const progressionCards = useMemo(() => {
    return PROGRESSION_EXERCISES.map((exerciseName) => {
      const points = workoutSessions
        .map((session) => {
          const sets = ((session.workout_sets ?? []) as WorkoutSetRow[])
            .filter((s) => s.exercise_name === exerciseName);
          if (sets.length === 0) return null;
          const max = Math.max(...sets.map((s) => s.weight_kg));
          return {
            date: session.date,
            weight: max,
            label: format(new Date(`${session.date}T12:00:00`), "d/MM", { locale: fr }),
          };
        })
        .filter((p): p is { date: string; weight: number; label: string } => p !== null)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (points.length < 2) return null;

      return {
        exerciseName,
        maxWeight: Math.max(...points.map((p) => p.weight)),
        points,
      };
    }).filter((c): c is { exerciseName: string; maxWeight: number; points: { date: string; weight: number; label: string }[] } => c !== null);
  }, [workoutSessions]);

  const handleBarClick = (e: any) => {
    const payload = e?.activePayload?.[0]?.payload as StrengthChartPoint | undefined;
    if (!payload || payload.duration <= 0) return;

    if (period === "year") {
      const year = Number(payload.date.slice(0, 4));
      const month = Number(payload.date.slice(5, 7)) - 1;
      const monthActivity = appleActivities.find((a) => {
        const d = new Date(a.start_time);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      if (monthActivity) setSelectedActivity(monthActivity);
      return;
    }

    const activity = appleActivities.find((a) => a.start_time.slice(0, 10) === payload.date);
    if (activity) setSelectedActivity(activity);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Musculation</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      {bodyChartData.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-display font-semibold text-foreground mb-3">Évolution 30 jours</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={bodyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => format(new Date(`${v}T12:00:00`), "dd/MM", { locale: fr })}
              />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="Poids" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Muscle" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-display font-semibold text-foreground">
            Durée par séance
          </h2>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} onClick={handleBarClick}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${v} min`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              formatter={(v: number) => [`${Math.round(v)} min`, "Durée"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
            />
            <Bar dataKey="duration" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {chartData.map((entry, index) => (
                <Cell
                  key={index}
                  fill={selectedActivity && entry.date === selectedActivity.start_time?.slice(0, 10)
                    ? "hsl(0, 70%, 40%)"
                    : "hsl(var(--strength))"}
                  fillOpacity={entry.duration > 0 ? 1 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selectedActivity && (
        <div className="rounded-xl border-2 p-4 relative" style={{ borderColor: "hsl(var(--strength))" }}>
          <button
            onClick={() => {
              setSelectedActivity(null);
              setActiveSessionId(null);
            }}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="font-display font-semibold text-foreground mb-3">
            Détail — {format(new Date(selectedActivity.start_time), "EEEE d MMMM yyyy, HH:mm", { locale: fr })}
          </p>

          <div className="flex flex-wrap gap-6 mb-4">
            <DetailStat icon={<Timer className="h-4 w-4 text-strength" />} label="Durée" value={`${Math.round(selectedActivity.duration_sec / 60)} min`} />
            <DetailStat icon={<Flame className="h-4 w-4 text-strength" />} label="Calories" value={selectedActivity.calories ? `${selectedActivity.calories} kcal` : "—"} />
          </div>

          <LogbookView
            sessionId={linkedSessionId ?? "__pending__"}
            activityId={selectedActivity.id}
            onSessionCreated={(id) => setActiveSessionId(id)}
            onClose={() => setActiveSessionId(null)}
          />
        </div>
      )}

      {progressionCards.length > 0 && (
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-3">Progression</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {progressionCards.map((card) => (
              <div key={card.exerciseName} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{card.exerciseName}</p>
                  <p className="text-xs text-muted-foreground">Max {card.maxWeight} kg</p>
                </div>
                <ResponsiveContainer width="100%" height={110}>
                  <LineChart data={card.points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                      formatter={(v: number) => [`${v} kg`, "Charge max"]}
                    />
                    <Line type="monotone" dataKey="weight" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LogbookView({
  sessionId,
  activityId,
  onSessionCreated,
  onClose,
}: {
  sessionId: string;
  activityId: string;
  onSessionCreated: (id: string) => void;
  onClose: () => void;
}) {
  const {
    data: workoutSessions = [],
    isLoading: isWorkoutSessionsLoading,
    error: workoutSessionsError,
  } = useWorkoutSessions();
  const addSet = useAddWorkoutSet();
  const deleteSet = useDeleteWorkoutSet();
  const getOrCreateSessionForActivity = useGetOrCreateSessionForActivity();
  void onClose;

  const [exerciseDrawerOpen, setExerciseDrawerOpen] = useState(false);
  const [customExercise, setCustomExercise] = useState("");
  const [localExercises, setLocalExercises] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(
    sessionId !== "__pending__" ? sessionId : null
  );

  useEffect(() => {
    if (sessionId !== "__pending__") {
      setResolvedSessionId(sessionId);
    }
  }, [sessionId]);

  const effectiveSessionId = sessionId === "__pending__" ? resolvedSessionId : sessionId;
  const session = effectiveSessionId
    ? workoutSessions.find((s) => s.id === effectiveSessionId) ?? null
    : null;
  const sets = (session?.workout_sets ?? []) as WorkoutSetRow[];

  useEffect(() => {
    console.log("[logbook] début fetch, workout_id:", effectiveSessionId ?? null);
    if (!effectiveSessionId) {
      console.log("[logbook] workout_id/session_id absent, activity_id:", activityId);
    }
  }, [effectiveSessionId, activityId]);

  useEffect(() => {
    if (!isWorkoutSessionsLoading) return;
    const timeoutId = setTimeout(() => {
      setErrorMessage("Impossible de charger le logbook. Réessaie.");
    }, 10000);
    return () => clearTimeout(timeoutId);
  }, [isWorkoutSessionsLoading, effectiveSessionId, activityId]);

  useEffect(() => {
    if (workoutSessionsError) {
      const message =
        workoutSessionsError instanceof Error
          ? workoutSessionsError.message
          : "Impossible de charger le logbook. Réessaie.";
      setErrorMessage(message);
      return;
    }
    if (!isWorkoutSessionsLoading) {
      setErrorMessage(null);
    }
  }, [workoutSessionsError, isWorkoutSessionsLoading]);

  const groupedExercises = useMemo(() => {
    const map = new Map<string, WorkoutSetRow[]>();
    for (const s of sets) {
      const arr = map.get(s.exercise_name) ?? [];
      arr.push(s);
      map.set(s.exercise_name, arr);
    }
    const merged = [...Array.from(map.keys())];
    for (const e of localExercises) {
      if (!merged.includes(e)) merged.push(e);
    }
    return merged.map((name) => ({
      exerciseName: name,
      sets: (map.get(name) ?? []).slice().sort((a, b) => a.set_number - b.set_number),
    }));
  }, [sets, localExercises]);

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {errorMessage}
      </div>
    );
  }

  if (isWorkoutSessionsLoading) {
    return (
      <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
        Chargement du logbook...
      </div>
    );
  }

  const openDraft = (exerciseName: string) => {
    setDrafts((prev) => ({
      ...prev,
      [exerciseName]: { ...(prev[exerciseName] ?? { reps: "8", weight: "" }), open: true },
    }));
  };

  const closeDraft = (exerciseName: string) => {
    setDrafts((prev) => ({
      ...prev,
      [exerciseName]: { ...(prev[exerciseName] ?? { reps: "8", weight: "" }), open: false },
    }));
  };

  const handleDraftChange = (exerciseName: string, field: "reps" | "weight", value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [exerciseName]: {
        reps: prev[exerciseName]?.reps ?? "8",
        weight: prev[exerciseName]?.weight ?? "",
        open: prev[exerciseName]?.open ?? true,
        [field]: value,
      },
    }));
  };

  const ensureSessionId = async () => {
    if (effectiveSessionId) return effectiveSessionId;
    const created = await getOrCreateSessionForActivity.mutateAsync(activityId);
    setResolvedSessionId(created);
    onSessionCreated(created);
    return created;
  };

  const handleAddExercise = async (exerciseNameRaw: string) => {
    const exerciseName = exerciseNameRaw.trim();
    if (!exerciseName) return;
    try {
      await ensureSessionId();
    } catch (e) {
      toast.error((e as Error).message || "Impossible de créer la séance");
      return;
    }
    setLocalExercises((prev) => (prev.includes(exerciseName) ? prev : [...prev, exerciseName]));
    setExerciseDrawerOpen(false);
    setCustomExercise("");
  };

  const handleAddSet = (exerciseName: string, existingCount: number) => {
    if (!effectiveSessionId) {
      toast.error("Séance indisponible");
      return;
    }
    const reps = Number(drafts[exerciseName]?.reps ?? 0);
    const weight = Number((drafts[exerciseName]?.weight ?? "").replace(",", "."));

    if (!Number.isFinite(reps) || reps <= 0) {
      toast.error("Reps invalides");
      return;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      toast.error("Poids invalide");
      return;
    }

    addSet.mutate(
      {
        session_id: effectiveSessionId,
        exercise_name: exerciseName,
        set_number: existingCount + 1,
        reps,
        weight_kg: Math.round(weight * 10) / 10,
      },
      {
        onSuccess: () => {
          toast.success("Série ajoutée");
          setDrafts((prev) => ({
            ...prev,
            [exerciseName]: { reps: String(reps), weight: "", open: false },
          }));
        },
        onError: (e) => toast.error((e as Error).message || "Impossible d'ajouter la série"),
      }
    );
  };

  const handleDeleteSet = (setId: string) => {
    deleteSet.mutate(setId, {
      onSuccess: () => toast.success("Série supprimée"),
      onError: (e) => toast.error((e as Error).message || "Impossible de supprimer la série"),
    });
  };

  return (
    <div className="space-y-3">
      {groupedExercises.length === 0 ? (
        <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
          Aucun exercice enregistré pour cette séance. Appuie sur + pour commencer.
        </div>
      ) : (
        groupedExercises.map(({ exerciseName, sets: exSets }) => (
          <ExerciseLogbookBlock
            key={exerciseName}
            sessionId={effectiveSessionId ?? "__pending__"}
            sessionDate={session?.date ?? new Date().toISOString().slice(0, 10)}
            exerciseName={exerciseName}
            sets={exSets}
            draft={drafts[exerciseName]}
            onOpenDraft={() => openDraft(exerciseName)}
            onCloseDraft={() => closeDraft(exerciseName)}
            onDraftChange={(field, value) => handleDraftChange(exerciseName, field, value)}
            onAddSet={() => handleAddSet(exerciseName, exSets.length)}
            onDeleteSet={handleDeleteSet}
          />
        ))
      )}

      <Drawer open={exerciseDrawerOpen} onOpenChange={setExerciseDrawerOpen}>
        <DrawerTrigger asChild>
          <Button variant="outline" className="w-full border-border bg-card hover:bg-secondary">
            <Plus className="h-4 w-4 mr-1" />
            Ajouter un exercice
          </Button>
        </DrawerTrigger>
        <DrawerContent className="bg-card border-border">
          <DrawerHeader>
            <DrawerTitle>Ajouter un exercice</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {FREQUENT_EXERCISES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => { void handleAddExercise(ex); }}
                  className="px-3 py-1.5 text-xs rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Autre exercice</Label>
              <Input
                value={customExercise}
                onChange={(e) => setCustomExercise(e.target.value)}
                className="bg-secondary border-border"
                placeholder="Ex: Rowing barre"
              />
              <Button onClick={() => { void handleAddExercise(customExercise); }} style={{ backgroundColor: "hsl(var(--strength))" }} className="text-white">
                Ajouter
              </Button>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost">Fermer</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

    </div>
  );
}

function ExerciseLogbookBlock({
  sessionId,
  sessionDate,
  exerciseName,
  sets,
  draft,
  onOpenDraft,
  onCloseDraft,
  onDraftChange,
  onAddSet,
  onDeleteSet,
}: {
  sessionId: string;
  sessionDate: string;
  exerciseName: string;
  sets: WorkoutSetRow[];
  draft?: ExerciseDraft;
  onOpenDraft: () => void;
  onCloseDraft: () => void;
  onDraftChange: (field: "reps" | "weight", value: string) => void;
  onAddSet: () => void;
  onDeleteSet: (setId: string) => void;
}) {
  const { data: lastPerfRaw = [] } = useLastPerformance(exerciseName);
  const lastPerf = lastPerfRaw as LastPerfRow[];

  const previousSets = lastPerf.filter((s) => s.session_id !== sessionId);
  const extractDate = (row: LastPerfRow) => {
    if (!row.workout_sessions) return undefined;
    if (Array.isArray(row.workout_sessions)) return row.workout_sessions[0]?.date;
    return row.workout_sessions.date;
  };

  const lastSessionDate = previousSets.length > 0 ? extractDate(previousSets[0]) : undefined;

  const lastSummary = useMemo(() => {
    if (!lastSessionDate) return "—";
    const sameDay = previousSets.filter((s) => extractDate(s) === lastSessionDate);
    if (sameDay.length === 0) return "—";
    const setCount = sameDay.length;
    const repsRef = sameDay[0]?.reps ?? 0;
    const kgRef = sameDay[0]?.weight_kg ?? 0;
    const dateLabel = format(new Date(`${lastSessionDate}T12:00:00`), "d MMM", { locale: fr });
    return `${dateLabel} -> ${setCount}x${repsRef} @ ${kgRef}kg`;
  }, [lastSessionDate, previousSets]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-semibold text-foreground">{exerciseName}</h3>
        <span className="text-xs text-muted-foreground">{format(new Date(`${sessionDate}T12:00:00`), "d MMM", { locale: fr })}</span>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-xs text-muted-foreground mb-1">
        <span>Set</span>
        <span>Reps</span>
        <span>Kg</span>
        <span></span>
      </div>

      {sets.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">Aucune série</div>
      ) : (
        sets.map((set) => (
          <div key={set.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center text-sm py-1">
            <span className="text-foreground">{set.set_number}</span>
            <span className="text-foreground">{set.reps}</span>
            <span className="text-foreground">{set.weight_kg}</span>
            <button onClick={() => onDeleteSet(set.id)} className="text-destructive hover:text-destructive/80" title="Supprimer la série">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}

      <div className="mt-2 text-xs text-muted-foreground bg-secondary/40 rounded-md px-2 py-1">Dernière fois : {lastSummary}</div>

      {draft?.open ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Reps</Label>
            <Input type="number" value={draft.reps} onChange={(e) => onDraftChange("reps", e.target.value)} className="bg-secondary border-border h-8 w-20" />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Kg</Label>
            <Input type="number" step="0.5" value={draft.weight} onChange={(e) => onDraftChange("weight", e.target.value)} className="bg-secondary border-border h-8 w-24" />
          </div>
          <Button size="icon" className="h-8 w-8" style={{ backgroundColor: "hsl(var(--strength))" }} onClick={onAddSet}>
            <Check className="h-4 w-4 text-white" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCloseDraft}>Annuler</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={onOpenDraft}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter une série
        </Button>
      )}
    </div>
  );
}

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
      {(Object.keys(periodLabels) as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === p
              ? "bg-running text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {periodLabels[p]}
        </button>
      ))}
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

function MetricCard({
  label,
  value,
  delta,
  invertDelta,
  icon,
}: {
  label: string;
  value: string;
  delta: string | null;
  invertDelta?: boolean;
  icon: React.ReactNode;
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
          {isPositive
            ? <TrendingUp className="h-3 w-3" />
            : isPositive === false
              ? <TrendingDown className="h-3 w-3" />
              : <Minus className="h-3 w-3" />}
          {parseFloat(delta) > 0 ? "+" : ""}{delta} vs précédent
        </div>
      )}
    </div>
  );
}

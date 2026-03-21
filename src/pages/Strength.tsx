import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Dumbbell,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Check,
  ArrowLeft,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { useLatestBodyMetric, useBodyMetrics } from "@/hooks/useBodyMetrics";
import {
  useWorkoutSessions,
  useCreateWorkoutSession,
  useDeleteWorkoutSession,
  useAddWorkoutSet,
  useDeleteWorkoutSet,
  useLastPerformance,
  type WorkoutSessionRow,
  type WorkoutSetRow,
} from "@/hooks/useWorkoutSessions";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ExerciseDraft = { reps: string; weight: string; open: boolean };

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

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Strength() {
  const { data: latestMetrics = [] } = useLatestBodyMetric();
  const { data: bodyHistory = [] } = useBodyMetrics(30);
  const { data: workoutSessions = [] } = useWorkoutSessions();

  const createSession = useCreateWorkoutSession();
  const deleteSession = useDeleteWorkoutSession();
  const addSet = useAddWorkoutSet();
  const deleteSet = useDeleteWorkoutSet();

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDate, setCreateDate] = useState(todayLocal());
  const [createNotes, setCreateNotes] = useState("");

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [historyExpandedId, setHistoryExpandedId] = useState<string | null>(null);

  const [exerciseDrawerOpen, setExerciseDrawerOpen] = useState(false);
  const [customExercise, setCustomExercise] = useState("");
  const [localExercises, setLocalExercises] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ExerciseDraft>>({});

  const latest = latestMetrics[0];
  const previous = latestMetrics[1];

  const weightDelta = latest && previous && latest.weight_kg && previous.weight_kg
    ? (latest.weight_kg - previous.weight_kg).toFixed(1)
    : null;
  const fatDelta = latest && previous && latest.body_fat_pc && previous.body_fat_pc
    ? (latest.body_fat_pc - previous.body_fat_pc).toFixed(1)
    : null;
  const muscleDelta = latest && previous && latest.muscle_mass_kg && previous.muscle_mass_kg
    ? (latest.muscle_mass_kg - previous.muscle_mass_kg).toFixed(1)
    : null;

  const bodyChartData = bodyHistory
    .filter((m) => m.weight_kg || m.muscle_mass_kg)
    .map((m) => ({
      date: m.date,
      Poids: m.weight_kg,
      Muscle: m.muscle_mass_kg,
    }));

  const activeSession = useMemo(
    () => workoutSessions.find((s) => s.id === activeSessionId) ?? null,
    [workoutSessions, activeSessionId]
  );

  const activeSets = (activeSession?.workout_sets ?? []) as WorkoutSetRow[];

  const groupedExercises = useMemo(() => {
    const map = new Map<string, WorkoutSetRow[]>();
    for (const s of activeSets) {
      const arr = map.get(s.exercise_name) ?? [];
      arr.push(s);
      map.set(s.exercise_name, arr);
    }
    const fromSets = Array.from(map.keys());
    const merged = [...fromSets];
    for (const e of localExercises) {
      if (!merged.includes(e)) merged.push(e);
    }
    return merged.map((name) => ({
      exerciseName: name,
      sets: (map.get(name) ?? []).slice().sort((a, b) => a.set_number - b.set_number),
    }));
  }, [activeSets, localExercises]);

  const historySessions = workoutSessions.slice(0, 10);

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

  const openDraft = (exerciseName: string) => {
    setDrafts((prev) => ({
      ...prev,
      [exerciseName]: prev[exerciseName] ?? { reps: "8", weight: "", open: true },
    }));
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

  const handleCreateSession = () => {
    createSession.mutate(
      { date: createDate, name: createName, notes: createNotes },
      {
        onSuccess: (id) => {
          toast.success("Séance créée");
          setCreateOpen(false);
          setCreateName("");
          setCreateNotes("");
          setActiveSessionId(id);
          setLocalExercises([]);
          setDrafts({});
        },
        onError: (e) => toast.error((e as Error).message || "Impossible de créer la séance"),
      }
    );
  };

  const handleAddExercise = (exerciseNameRaw: string) => {
    const exerciseName = exerciseNameRaw.trim();
    if (!exerciseName) return;
    setLocalExercises((prev) => (prev.includes(exerciseName) ? prev : [...prev, exerciseName]));
    setExerciseDrawerOpen(false);
    setCustomExercise("");
  };

  const handleAddSet = (exerciseName: string, existingCount: number) => {
    if (!activeSession) return;

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
        session_id: activeSession.id,
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

  const handleDeleteSession = (sessionId: string) => {
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        toast.success("Séance supprimée");
        if (activeSessionId === sessionId) setActiveSessionId(null);
        if (historyExpandedId === sessionId) setHistoryExpandedId(null);
      },
      onError: (e) => toast.error((e as Error).message || "Impossible de supprimer la séance"),
    });
  };

  if (activeSession) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setActiveSessionId(null);
              setLocalExercises([]);
              setDrafts({});
            }}
            className="h-8 px-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour
          </button>
          <div className="text-right">
            <p className="font-display font-semibold text-foreground">{activeSession.name || "Séance"}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(`${activeSession.date}T12:00:00`), "EEEE d MMMM yyyy", { locale: fr })}</p>
          </div>
          <Button onClick={() => setActiveSessionId(null)} style={{ backgroundColor: "hsl(var(--strength))" }} className="text-white">
            Terminer
          </Button>
        </div>

        {groupedExercises.length === 0 ? (
          <div className="glass-card p-6 text-center text-sm text-muted-foreground">
            Aucun exercice dans cette séance pour l'instant.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedExercises.map(({ exerciseName, sets }) => (
              <ExerciseLogbookBlock
                key={exerciseName}
                sessionId={activeSession.id}
                sessionDate={activeSession.date}
                exerciseName={exerciseName}
                sets={sets}
                draft={drafts[exerciseName]}
                onOpenDraft={() => openDraft(exerciseName)}
                onCloseDraft={() => closeDraft(exerciseName)}
                onDraftChange={(field, value) => handleDraftChange(exerciseName, field, value)}
                onAddSet={() => handleAddSet(exerciseName, sets.length)}
                onDeleteSet={handleDeleteSet}
              />
            ))}
          </div>
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
                    onClick={() => handleAddExercise(ex)}
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
                <Button onClick={() => handleAddExercise(customExercise)} style={{ backgroundColor: "hsl(var(--strength))" }} className="text-white">
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Musculation</h1>
        <Drawer open={createOpen} onOpenChange={setCreateOpen}>
          <DrawerTrigger asChild>
            <Button style={{ backgroundColor: "hsl(var(--strength))" }} className="text-white">
              <Plus className="h-4 w-4 mr-1" />
              Nouvelle séance
            </Button>
          </DrawerTrigger>
          <DrawerContent className="bg-card border-border">
            <DrawerHeader>
              <DrawerTitle>Nouvelle séance</DrawerTitle>
            </DrawerHeader>
            <div className="px-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Nom de la séance (optionnel)</Label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Push / Pull / Legs"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Notes (optionnel)</Label>
                <Textarea
                  value={createNotes}
                  onChange={(e) => setCreateNotes(e.target.value)}
                  className="bg-secondary border-border min-h-[90px]"
                />
              </div>
            </div>
            <DrawerFooter>
              <Button onClick={handleCreateSession} disabled={createSession.isPending} style={{ backgroundColor: "hsl(var(--strength))" }} className="text-white">
                {createSession.isPending ? "Création..." : "Créer la séance"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost">Annuler</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <MetricCard
          label="Masse Musculaire"
          value={latest?.muscle_mass_kg ? `${latest.muscle_mass_kg} kg` : "—"}
          delta={muscleDelta}
          icon={<Dumbbell className="h-5 w-5 text-strength" />}
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
              <YAxis
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="Poids" stroke="hsl(var(--strength))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Muscle" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <h2 className="text-lg font-display font-semibold text-foreground mb-3">Historique des séances</h2>
        <div className="space-y-2">
          {historySessions.map((session) => {
            const sets = (session.workout_sets ?? []) as WorkoutSetRow[];
            const exerciseCount = new Set(sets.map((s) => s.exercise_name)).size;
            const setCount = sets.length;
            const totalKg = Math.round(sets.reduce((sum, s) => sum + (s.reps * s.weight_kg), 0));
            const isOpen = historyExpandedId === session.id;

            const grouped = sets.reduce<Record<string, WorkoutSetRow[]>>((acc, s) => {
              if (!acc[s.exercise_name]) acc[s.exercise_name] = [];
              acc[s.exercise_name].push(s);
              return acc;
            }, {});

            return (
              <div key={session.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {format(new Date(`${session.date}T12:00:00`), "EEEE d MMMM yyyy", { locale: fr })}
                      {session.name ? ` · ${session.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {exerciseCount} exercices · {setCount} séries · {totalKg.toLocaleString()} kg total
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setHistoryExpandedId(isOpen ? null : session.id)}
                    >
                      {isOpen ? "Masquer" : "Voir détail"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSession(session.id)}
                      disabled={deleteSession.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {Object.entries(grouped).map(([exerciseName, exSets]) => (
                      <div key={exerciseName} className="rounded-lg bg-secondary/30 p-3">
                        <p className="text-sm font-medium text-foreground mb-2">{exerciseName}</p>
                        <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs text-muted-foreground">
                          <span>Set</span>
                          <span>Reps</span>
                          <span>Kg</span>
                        </div>
                        {exSets
                          .slice()
                          .sort((a, b) => a.set_number - b.set_number)
                          .map((set) => (
                            <div key={set.id} className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm text-foreground py-0.5">
                              <span>{set.set_number}</span>
                              <span>{set.reps}</span>
                              <span>{set.weight_kg}</span>
                            </div>
                          ))}
                      </div>
                    ))}
                    <Button
                      size="sm"
                      style={{ backgroundColor: "hsl(var(--strength))" }}
                      className="text-white"
                      onClick={() => {
                        setActiveSessionId(session.id);
                        setLocalExercises([]);
                        setDrafts({});
                      }}
                    >
                      Continuer cette séance
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {historySessions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucune séance enregistrée</p>
          )}
        </div>
      </div>

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
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
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
  const { data: lastPerf = [] } = useLastPerformance(exerciseName);

  const previousSets = (lastPerf as any[]).filter((s) => s.session_id !== sessionId);
  const lastSessionDate = (previousSets[0]?.workout_sessions as any)?.date
    || (Array.isArray(previousSets[0]?.workout_sessions) ? previousSets[0].workout_sessions[0]?.date : undefined);

  const lastSummary = useMemo(() => {
    if (!lastSessionDate) return "—";
    const sameDay = previousSets.filter((s) => {
      const d = (s.workout_sessions as any)?.date
        || (Array.isArray(s.workout_sessions) ? s.workout_sessions[0]?.date : undefined);
      return d === lastSessionDate;
    });
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
            <button
              onClick={() => onDeleteSet(set.id)}
              className="text-destructive hover:text-destructive/80"
              title="Supprimer la série"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}

      <div className="mt-2 text-xs text-muted-foreground bg-secondary/40 rounded-md px-2 py-1">
        Dernière fois : {lastSummary}
      </div>

      {draft?.open ? (
        <div className="mt-3 flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Reps</Label>
            <Input
              type="number"
              value={draft.reps}
              onChange={(e) => onDraftChange("reps", e.target.value)}
              className="bg-secondary border-border h-8 w-20"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Kg</Label>
            <Input
              type="number"
              step="0.5"
              value={draft.weight}
              onChange={(e) => onDraftChange("weight", e.target.value)}
              className="bg-secondary border-border h-8 w-24"
            />
          </div>
          <Button size="icon" className="h-8 w-8" style={{ backgroundColor: "hsl(var(--strength))" }} onClick={onAddSet}>
            <Check className="h-4 w-4 text-white" />
          </Button>
          <Button size="sm" variant="ghost" onClick={onCloseDraft}>Annuler</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-3" onClick={onOpenDraft}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter une serie
        </Button>
      )}
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
          {parseFloat(delta) > 0 ? "+" : ""}{delta} vs precedent
        </div>
      )}
    </div>
  );
}

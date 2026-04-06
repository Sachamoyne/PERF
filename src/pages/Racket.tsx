import { useState, useMemo } from "react";
import { useActivities } from "@/hooks/useHealthData";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { Timer, Heart, Trophy, Swords, Dumbbell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import LogSessionDrawer from "@/components/racket/LogSessionDrawer";

type Filter = "all" | "tennis" | "padel";

export default function Racket() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data: activities = [] } = useActivities(filter === "all" ? ["tennis", "padel"] : filter);
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any | null>(null);
  const [isMatch, setIsMatch] = useState(false);
  const [opponentName, setOpponentName] = useState("");
  const [matchScore, setMatchScore] = useState("");
  const [matchResult, setMatchResult] = useState<"win" | "loss">("win");
  const [surface, setSurface] = useState<"clay" | "hard" | "indoor" | "grass" | "other">("hard");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { user } = useAuth();

  const filters: { value: Filter; label: string; emoji: string }[] = [
    { value: "all", label: "Tous", emoji: "🏆" },
    { value: "tennis", label: "Tennis", emoji: "🎾" },
    { value: "padel", label: "Padel", emoji: "🏸" },
  ];

  // Weekly stats
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const weeklyActivities = useMemo(
    () => activities.filter((a) => {
      const d = new Date(a.start_time);
      return d >= weekStart && d <= weekEnd;
    }),
    [activities, weekStart, weekEnd]
  );

  const weeklyHours = weeklyActivities.reduce((s, a) => s + a.duration_sec, 0) / 3600;
  const weeklyMatches = weeklyActivities.filter((a: any) => (a.session_type || "").startsWith("match")).length;
  const weeklySessions = weeklyActivities.length;

  // Weekly volume target (arbitrary 8h goal)
  const weeklyGoal = 8;
  const progressPct = Math.min((weeklyHours / weeklyGoal) * 100, 100);

  const openMatchDialog = (activity: any) => {
    setSelectedActivity(activity);
    const isMatchSession = (activity.session_type || "").startsWith("match");
    setIsMatch(isMatchSession);
    setOpponentName(activity.opponent_name || "");
    setMatchScore(activity.match_score || "");
    setMatchResult((activity.match_result as "win" | "loss") || "win");

    const surfaceToken = (activity.session_type || "").split(":")[1] as
      | "clay"
      | "hard"
      | "indoor"
      | "grass"
      | "other"
      | undefined;
    setSurface(surfaceToken || "hard");
    setMatchDialogOpen(true);
  };

  const handleSaveMatch = async () => {
    if (!selectedActivity || !user) return;
    setSaving(true);
    try {
      const session_type = isMatch ? (`match:${surface}` as string) : "training";
      const payload: any = {
        session_type,
        opponent_name: isMatch ? opponentName || null : null,
        match_score: isMatch ? matchScore || null : null,
        match_result: isMatch ? matchResult : null,
      };

      const { error } = await supabase
        .from("activities")
        .update(payload)
        .eq("id", selectedActivity.id)
        .eq("user_id", user.id);
      if (error) throw error;

      toast.success("Données de match mises à jour.");
      setMatchDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la mise à jour du match");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Sports de Raquette</h1>
        <LogSessionDrawer />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? f.value === "tennis"
                  ? "bg-tennis/20 text-tennis"
                  : f.value === "padel"
                    ? "bg-padel/20 text-padel"
                    : "bg-primary/15 text-primary"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.emoji} {f.label}
          </button>
        ))}
      </div>

      {/* Weekly Volume + Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Volume gauge */}
        <div className="glass-card p-5 sm:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-foreground text-sm">Volume hebdomadaire</h3>
            <span className="text-xs text-muted-foreground">{weeklyGoal}h objectif</span>
          </div>
          <div className="flex items-end gap-4 mb-4">
            <p className="text-4xl font-display font-bold text-foreground">
              {weeklyHours.toFixed(1)}<span className="text-lg font-normal text-muted-foreground ml-1">h</span>
            </p>
            <p className="text-sm text-muted-foreground pb-1">{weeklySessions} session{weeklySessions !== 1 ? "s" : ""}</p>
          </div>
          {/* Progress bar */}
          <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${progressPct}%`,
                background: `linear-gradient(90deg, hsl(var(--tennis)), hsl(var(--padel)))`,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-muted-foreground">0h</span>
            <span className="text-[10px] text-muted-foreground">{weeklyGoal}h</span>
          </div>
        </div>

        {/* Matches played */}
        <div className="glass-card p-5 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-primary/15">
              <Swords className="h-5 w-5 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-foreground text-sm">Matchs joués</h3>
          </div>
          <p className="text-4xl font-display font-bold text-foreground">
            {weeklyMatches}
          </p>
          <p className="text-xs text-muted-foreground mt-1">cette semaine</p>
        </div>
      </div>

      {/* Session cards */}
      <div>
        <h3 className="font-display font-semibold text-foreground mb-3">Sessions récentes</h3>
        {activities.length === 0 ? (
          <div className="glass-card p-8 flex items-center justify-center text-muted-foreground text-sm">
            <Dumbbell className="h-4 w-4 mr-2 opacity-50" />
            Aucune session enregistrée
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activities.slice(0, 8).map((a: any) => (
              <SessionCard key={a.id} activity={a} onClick={() => openMatchDialog(a)} />
            ))}
          </div>
        )}
      </div>

      {/* Match detail dialog */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent className="glass-card border-glass-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground">
              Détails du match
            </DialogTitle>
          </DialogHeader>

          {selectedActivity && (
            <div className="space-y-4 pt-2">
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedActivity.start_time), "EEEE d MMMM yyyy, HH:mm", {
                  locale: fr,
                })}{" "}
                — {selectedActivity.sport_type === "tennis" ? "Tennis" : "Padel"}
              </p>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">C'était un match ?</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Active si cette session correspond à un match officiel ou amical.
                  </p>
                </div>
                <Switch checked={isMatch} onCheckedChange={setIsMatch} />
              </div>

              {isMatch && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Score</Label>
                    <Input
                      value={matchScore}
                      onChange={(e) => setMatchScore(e.target.value)}
                      placeholder="6-4 3-6 10-8"
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Adversaire</Label>
                    <Input
                      value={opponentName}
                      onChange={(e) => setOpponentName(e.target.value)}
                      placeholder="Nom de l'adversaire"
                      className="bg-secondary border-border text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Résultat</Label>
                      <Select value={matchResult} onValueChange={(v) => setMatchResult(v as "win" | "loss")}>
                        <SelectTrigger className="bg-secondary border-border h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="win">Victoire</SelectItem>
                          <SelectItem value="loss">Défaite</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Surface</Label>
                      <Select value={surface} onValueChange={(v) => setSurface(v as any)}>
                        <SelectTrigger className="bg-secondary border-border h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="clay">Terre battue</SelectItem>
                          <SelectItem value="hard">Dur</SelectItem>
                          <SelectItem value="indoor">Indoor</SelectItem>
                          <SelectItem value="grass">Gazon</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMatchDialogOpen(false)}
                  disabled={saving}
                >
                  Annuler
                </Button>
                <Button
                  size="sm"
                  className="bg-primary/90 hover:bg-primary text-primary-foreground"
                  onClick={handleSaveMatch}
                  disabled={saving}
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionCard({ activity, onClick }: { activity: any; onClick: () => void }) {
  const isMatch = (activity.session_type || "").startsWith("match");
  const isTennis = activity.sport_type === "tennis";
  const accentColor = isTennis ? "tennis" : "padel";

  return (
    <div
      className={`glass-card p-4 border-l-4 transition-colors cursor-pointer hover:bg-accent/5 ${
      isTennis ? "border-tennis" : "border-padel"
    }`}
      onClick={onClick}
    >
      {/* Top row: badge + date */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`sport-badge ${
            isTennis ? "bg-tennis/20 text-tennis" : "bg-padel/20 text-padel"
          }`}>
            {isTennis ? "🎾 Tennis" : "🏸 Padel"}
          </span>
          {isMatch && (
            <span className={`sport-badge ${
              activity.match_result === "win"
                ? "bg-primary/20 text-primary"
                : "bg-destructive/20 text-destructive"
            }`}>
              {activity.match_result === "win" ? "Victoire" : "Défaite"}
            </span>
          )}
          {!isMatch && (
            <span className="sport-badge bg-secondary text-muted-foreground">
              Entraînement
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(activity.start_time), "d MMM yyyy", { locale: fr })}
        </span>
      </div>

      {/* Match info */}
      {isMatch && (activity.opponent_name || activity.match_score) && (
        <div className="mb-2.5 flex items-center gap-2 text-sm">
          {activity.opponent_name && (
            <span className="font-medium text-foreground flex items-center gap-1">
              <Swords className="h-3.5 w-3.5 text-muted-foreground" />
              Vs {activity.opponent_name}
            </span>
          )}
          {activity.match_score && (
            <>
              <span className="text-muted-foreground">|</span>
              <span className="font-mono text-foreground">{activity.match_score}</span>
            </>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-foreground">
        <span className="flex items-center gap-1">
          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          {Math.round(activity.duration_sec / 60)} min
        </span>
        <span className="flex items-center gap-1">
          <Heart className="h-3.5 w-3.5 text-muted-foreground" />
          {activity.avg_hr ?? "—"} bpm
        </span>
        {activity.calories && (
          <span className="text-muted-foreground">{activity.calories} kcal</span>
        )}
      </div>
    </div>
  );
}

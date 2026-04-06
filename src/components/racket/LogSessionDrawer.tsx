import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function todayLocalStr(): string {
  return new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
}

export default function LogSessionDrawer() {
  const [open, setOpen] = useState(false);
  const [sport, setSport] = useState<"tennis" | "padel">("tennis");
  const [date, setDate] = useState(todayLocalStr);
  const [duration, setDuration] = useState("60");
  const [sessionType, setSessionType] = useState<"training" | "match">("training");
  const [opponentName, setOpponentName] = useState("");
  const [matchScore, setMatchScore] = useState("");
  const [matchResult, setMatchResult] = useState<"win" | "loss">("win");
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  const handleSubmit = async () => {
    if (!user || saving) return;
    const durationMin = parseInt(duration);
    if (!durationMin || durationMin <= 0) { toast.error("Durée invalide"); return; }
    setSaving(true);
    // Build start_time as noon on the selected date (Paris time → UTC)
    const startTime = new Date(`${date}T12:00:00`).toISOString();
    const { error } = await supabase.from("activities").insert({
      user_id: user.id,
      sport_type: sport,
      start_time: startTime,
      duration_sec: durationMin * 60,
      session_type: sessionType,
      opponent_name: sessionType === "match" ? opponentName || null : null,
      match_score: sessionType === "match" ? matchScore || null : null,
      match_result: sessionType === "match" ? matchResult : null,
    });
    if (error) { toast.error("Erreur"); setSaving(false); return; }
    toast.success("Session enregistrée");
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["today_workouts"] });
    qc.invalidateQueries({ queryKey: ["weekly_summary"] });
    qc.invalidateQueries({ queryKey: ["activity_heatmap"] });
    setOpen(false);
    setSaving(false);
    setDate(todayLocalStr());
    setDuration("60"); setSessionType("training"); setOpponentName(""); setMatchScore("");
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/80 text-primary-foreground">
          <Plus className="h-4 w-4" />
          Log Session
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader>
          <DrawerTitle className="font-display text-foreground">Enregistrer une session</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Sport</Label>
            <Select value={sport} onValueChange={(v) => setSport(v as "tennis" | "padel")}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tennis">🎾 Tennis</SelectItem>
                <SelectItem value="padel">🏓 Padel</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Durée (min)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="bg-secondary border-border" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Type</Label>
            <Select value={sessionType} onValueChange={(v) => setSessionType(v as "training" | "match")}>
              <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="training">Entraînement</SelectItem>
                <SelectItem value="match">Match</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sessionType === "match" && (
            <>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Adversaire</Label>
                <Input value={opponentName} onChange={(e) => setOpponentName(e.target.value)} placeholder="Nom" className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Score</Label>
                <Input value={matchScore} onChange={(e) => setMatchScore(e.target.value)} placeholder="6-4, 4-6, 10-8" className="bg-secondary border-border" />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Résultat</Label>
                <Select value={matchResult} onValueChange={(v) => setMatchResult(v as "win" | "loss")}>
                  <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win">Victoire</SelectItem>
                    <SelectItem value="loss">Défaite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <DrawerFooter>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary hover:bg-primary/80 text-primary-foreground">
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
          <DrawerClose asChild><Button variant="ghost">Annuler</Button></DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

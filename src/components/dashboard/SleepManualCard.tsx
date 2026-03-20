import { useMemo, useState } from "react";
import { Moon, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useInsertSleepLog, useLatestSleepLog } from "@/hooks/useSleepLogs";

function formatDuration(hours: number | null | undefined) {
  if (hours == null || Number.isNaN(hours)) return "—";
  return `${Math.round(hours * 10) / 10} h`;
}

function formatTimeRange(bedtime?: string | null, wakeTime?: string | null) {
  if (!bedtime || !wakeTime) return "—";
  return `${bedtime.slice(0, 5)} → ${wakeTime.slice(0, 5)}`;
}

function getYesterdayDate() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function calculateSleepDuration(bedtime: string, wakeTime: string): number | null {
  if (!bedtime || !wakeTime) return null;

  const [bedH, bedM] = bedtime.split(":").map(Number);
  const [wakeH, wakeM] = wakeTime.split(":").map(Number);

  if ([bedH, bedM, wakeH, wakeM].some((v) => Number.isNaN(v))) return null;

  const bedtimeMinutes = bedH * 60 + bedM;
  const wakeMinutes = wakeH * 60 + wakeM;
  let diff = wakeMinutes - bedtimeMinutes;

  if (diff <= 0) diff += 24 * 60;

  return Math.round((diff / 60) * 100) / 100;
}

function scoreClasses(score: number | null) {
  if (score == null) return "text-muted-foreground border-border";
  if (score >= 70) return "text-primary border-primary/40 bg-primary/10";
  if (score >= 50) return "text-amber-400 border-amber-400/40 bg-amber-400/10";
  return "text-destructive border-destructive/40 bg-destructive/10";
}

export function SleepManualCard() {
  const { data: latestSleep, isLoading } = useLatestSleepLog();
  const insertSleepLog = useInsertSleepLog();

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(getYesterdayDate);
  const [bedtime, setBedtime] = useState("23:30");
  const [wakeTime, setWakeTime] = useState("07:00");
  const [score, setScore] = useState(75);
  const [notes, setNotes] = useState("");

  const durationHours = useMemo(() => calculateSleepDuration(bedtime, wakeTime), [bedtime, wakeTime]);

  const handleSubmit = () => {
    if (!durationHours) {
      toast.error("Renseigne une heure de coucher et de réveil valides");
      return;
    }

    insertSleepLog.mutate(
      {
        date,
        bedtime,
        wake_time: wakeTime,
        duration_hours: durationHours,
        score,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Sommeil enregistré");
          setOpen(false);
          setDate(getYesterdayDate());
          setBedtime("23:30");
          setWakeTime("07:00");
          setScore(75);
          setNotes("");
        },
        onError: () => {
          toast.error("Impossible d'enregistrer ce sommeil");
        },
      }
    );
  };

  return (
    <div className="glass-card p-3 flex flex-col justify-between overflow-hidden" style={{ minHeight: "140px" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs min-w-0">
          <Moon className="h-4 w-4" />
          <span className="truncate">Sommeil</span>
        </div>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground">
              <Plus className="h-4 w-4" />
            </Button>
          </DrawerTrigger>
          <DrawerContent className="bg-card border-border">
            <DrawerHeader>
              <DrawerTitle className="font-display text-foreground">Saisir ton sommeil</DrawerTitle>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Heure de coucher</Label>
                  <Input
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Heure de réveil</Label>
                  <Input
                    type="time"
                    value={wakeTime}
                    onChange={(e) => setWakeTime(e.target.value)}
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Durée (calculée)</Label>
                <Input
                  value={formatDuration(durationHours)}
                  readOnly
                  className="bg-secondary border-border text-foreground"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">Score</Label>
                  <span className="text-xs text-muted-foreground">{score}/99</span>
                </div>
                <Slider
                  value={[score]}
                  onValueChange={(v) => setScore(v[0] ?? 0)}
                  min={0}
                  max={99}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Notes (optionnel)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Réveils nocturnes, ressenti, etc."
                  className="bg-secondary border-border min-h-[90px]"
                />
              </div>
            </div>

            <DrawerFooter>
              <Button
                onClick={handleSubmit}
                disabled={insertSleepLog.isPending}
                className="text-primary-foreground"
                style={{ backgroundColor: "hsl(217, 91%, 60%)" }}
              >
                {insertSleepLog.isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
              <DrawerClose asChild>
                <Button variant="ghost">Annuler</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>

      <div className="mt-1">
        <span className="text-xl font-display font-bold leading-none" style={{ color: "hsl(217, 91%, 60%)" }}>
          {isLoading ? "—" : formatDuration(latestSleep?.duration_hours)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground truncate">
          {isLoading ? "" : formatTimeRange(latestSleep?.bedtime, latestSleep?.wake_time)}
        </p>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${scoreClasses(latestSleep?.score ?? null)}`}>
          {latestSleep?.score != null ? `Score ${latestSleep.score}/99` : "Score —"}
        </span>
      </div>
    </div>
  );
}

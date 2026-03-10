import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp } from "lucide-react";
import { useInsertExerciseStat } from "@/hooks/useExerciseStats";
import { toast } from "sonner";

interface Props {
  exerciseName: string;
}

export default function UpdatePRDrawer({ exerciseName }: Props) {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("10");
  const [sets, setSets] = useState("3");
  const mutation = useInsertExerciseStat();

  const handleSubmit = () => {
    if (!weight) { toast.error("Saisis le poids"); return; }
    mutation.mutate(
      { exercise_name: exerciseName, weight_kg: parseFloat(weight), reps: parseInt(reps), sets: parseInt(sets) },
      {
        onSuccess: () => {
          toast.success("PR mis à jour");
          setWeight(""); setReps("10"); setSets("3");
          setOpen(false);
        },
        onError: () => toast.error("Erreur"),
      }
    );
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-strength hover:bg-strength/10 h-7 text-xs">
          <TrendingUp className="h-3 w-3" />
          Update PR
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader>
          <DrawerTitle className="font-display text-foreground">{exerciseName}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Poids (kg)</Label>
            <Input type="number" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="80" className="bg-secondary border-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Séries</Label>
              <Input type="number" value={sets} onChange={(e) => setSets(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Reps</Label>
              <Input type="number" value={reps} onChange={(e) => setReps(e.target.value)} className="bg-secondary border-border" />
            </div>
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={handleSubmit} disabled={mutation.isPending} className="bg-strength hover:bg-strength/80 text-primary-foreground">
            {mutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
          <DrawerClose asChild>
            <Button variant="ghost">Annuler</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

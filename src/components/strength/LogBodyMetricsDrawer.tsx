import { useState } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter, DrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale } from "lucide-react";
import { useInsertBodyMetric } from "@/hooks/useBodyMetrics";
import { toast } from "sonner";

export default function LogBodyMetricsDrawer() {
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [muscleMass, setMuscleMass] = useState("");
  const mutation = useInsertBodyMetric();

  const handleSubmit = () => {
    const values: Record<string, number> = {};
    if (weight) values.weight_kg = parseFloat(weight);
    if (bodyFat) values.body_fat_pc = parseFloat(bodyFat);
    if (muscleMass) values.muscle_mass_kg = parseFloat(muscleMass);

    if (Object.keys(values).length === 0) {
      toast.error("Remplis au moins un champ");
      return;
    }

    mutation.mutate(values, {
      onSuccess: () => {
        toast.success("Métriques enregistrées");
        setWeight(""); setBodyFat(""); setMuscleMass("");
        setOpen(false);
      },
      onError: () => toast.error("Erreur lors de l'enregistrement"),
    });
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button variant="outline" className="gap-2 border-strength/30 text-strength hover:bg-strength/10">
          <Scale className="h-4 w-4" />
          Log Metrics
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-card border-border">
        <DrawerHeader>
          <DrawerTitle className="font-display text-foreground">Saisir les métriques du jour</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Poids (kg)</Label>
            <Input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="78.5" className="bg-secondary border-border" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Masse grasse (%)</Label>
            <Input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="15.2" className="bg-secondary border-border" />
          </div>
          <div className="space-y-2">
            <Label className="text-muted-foreground">Masse musculaire (kg)</Label>
            <Input type="number" step="0.1" value={muscleMass} onChange={(e) => setMuscleMass(e.target.value)} placeholder="35.0" className="bg-secondary border-border" />
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

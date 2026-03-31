import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SyncConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
}

export function SyncConsentDialog({ open, onOpenChange, onAccept, onDecline }: SyncConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Tes donnees sont en securite
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground space-y-2">
            <p>
              Pour sauvegarder ton historique et te permettre d'acceder a Mova sur plusieurs appareils, tes donnees de sante
              (nutrition, sommeil, activite, composition corporelle) sont stockees de maniere chiffree sur nos serveurs securises.
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground space-y-1.5">
          <p>• Tes donnees ne sont jamais vendues ni partagees avec des tiers</p>
          <p>• Seul toi as acces a tes donnees</p>
          <p>• Tu peux supprimer toutes tes donnees a tout moment depuis les Parametres</p>
        </div>

        <DialogFooter className="sm:justify-end gap-2">
          <Button variant="outline" onClick={onDecline}>
            Utiliser sans synchronisation
          </Button>
          <Button onClick={onAccept}>J'accepte et je continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

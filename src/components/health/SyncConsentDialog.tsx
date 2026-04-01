import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SyncConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
  onDecline: () => void;
  blocking?: boolean;
}

export function SyncConsentDialog({ open, onOpenChange, onAccept, onDecline, blocking = false }: SyncConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-lg ${blocking ? "[&>button]:hidden" : ""}`}
        onEscapeKeyDown={(event) => {
          if (blocking) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (blocking) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground">Confidentialité et données</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground space-y-2">
            <p>
              Mova synchronise tes données de santé (activité, nutrition, sommeil, fréquence cardiaque) sur nos serveurs sécurisés afin de conserver ton historique.
            </p>
            <p>Tes données ne sont jamais partagées avec des tiers.</p>
            <p>En continuant, tu acceptes que tes données soient stockées sur nos serveurs.</p>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="sm:justify-end gap-2">
          <Button variant="outline" onClick={onDecline}>
            Refuser — données locales uniquement
          </Button>
          <Button onClick={onAccept}>J'accepte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

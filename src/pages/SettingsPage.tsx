import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { JsonDropZone } from "@/components/settings/JsonDropZone";

export default function SettingsPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) toast.error(error.message);
    else toast.success("Compte créé ! Vérifiez votre email.");
    setLoading(false);
  };

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(error.message);
    else toast.success("Connecté !");
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
  };

  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-2xl font-display font-bold text-foreground">Paramètres</h1>

      {user ? (
        <>
          <div className="glass-card p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Connecté en tant que</p>
            <p className="text-foreground font-medium">{user.email}</p>
            <Button variant="outline" onClick={handleSignOut}>Se déconnecter</Button>
          </div>

          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Import manuel de données</h2>
            <p className="text-sm text-muted-foreground">
              Glissez un fichier JSON contenant vos activités et métriques de santé.
            </p>
            <JsonDropZone />
          </div>
        </>
      ) : (
        <div className="glass-card p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Connectez-vous pour sauvegarder vos données
          </p>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Mot de passe</Label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSignIn} disabled={loading}>Connexion</Button>
            <Button variant="outline" onClick={handleSignUp} disabled={loading}>Créer un compte</Button>
          </div>
        </div>
      )}
    </div>
  );
}

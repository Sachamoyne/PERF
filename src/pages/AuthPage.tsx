import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity } from "lucide-react";

function getAuthErrorMessage(error: unknown): string {
  const message = String((error as { message?: string })?.message ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) return "Email ou mot de passe incorrect";
  if (normalized.includes("email not confirmed")) return "Confirme ton email avant de te connecter";
  if (normalized.includes("user already registered")) return "Un compte existe déjà avec cet email";
  if (normalized.includes("network") || normalized.includes("fetch")) return "Pas de connexion. Vérifie ton réseau.";
  return "Une erreur est survenue. Réessaie dans quelques instants.";
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Veuillez remplir tous les champs");
      return;
    }
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    setLoading(true);
    const redirectTo = (() => {
      try {
        return `${window.location.origin}/auth`;
      } catch {
        return undefined;
      }
    })();

    try {
      if (isLogin) {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
          toast.error(getAuthErrorMessage(res.error));
        } else {
          toast.success("Connecté !");
        }
      } else {
        const res = await supabase.auth.signUp({
          email,
          password,
          options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
        });

        if (res.error) {
          toast.error(getAuthErrorMessage(res.error));
        } else {
          // Supabase crée l'utilisateur même si email confirmation est activée.
          // user peut être null si un lien de confirmation est requis.
          const hasUser = !!res.data?.user;
          const hasSession = !!res.data?.session;
          toast.success(
            hasSession || hasUser
              ? "Compte créé !"
              : "Compte créé ! Vérifiez votre email pour confirmer."
          );
        }
      }
    } catch (err: any) {
      toast.error(getAuthErrorMessage(err));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20">
            <Activity className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Mova</h1>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Connectez-vous pour accéder à vos données" : "Créez votre compte pour commencer"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Chargement..." : isLogin ? "Se connecter" : "Créer un compte"}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-center text-sm text-muted-foreground">
          {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-primary hover:underline font-medium"
          >
            {isLogin ? "S'inscrire" : "Se connecter"}
          </button>
        </p>
      </div>
    </div>
  );
}

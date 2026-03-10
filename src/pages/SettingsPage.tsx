import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { JsonDropZone } from "@/components/settings/JsonDropZone";
import { Copy, Key, RefreshCw, CheckCircle2, Clock, Smartphone, Database, Trash2 } from "lucide-react";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { generateTestData, clearTestData } from "@/lib/mock-data";
import { useQueryClient } from "@tanstack/react-query";

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "ahk_";
  for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
  return key;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [mockLoading, setMockLoading] = useState(false);
  const syncStatus = useSyncStatus();
  const queryClient = useQueryClient();
  const isDev = import.meta.env.DEV;

  const endpointUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/apple-health-sync`;

  const fetchApiKey = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("api_key")
      .eq("user_id", user.id)
      .single();
    setApiKey((data as { api_key: string | null } | null)?.api_key ?? null);
  }, [user]);

  useEffect(() => { fetchApiKey(); }, [fetchApiKey]);

  const handleGenerateKey = async () => {
    if (!user) return;
    setApiKeyLoading(true);
    const newKey = generateApiKey();
    const { error } = await supabase
      .from("profiles")
      .update({ api_key: newKey } as Record<string, unknown>)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
    else { setApiKey(newKey); toast.success("Clé API générée !"); }
    setApiKeyLoading(false);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copié !`);
    setTimeout(() => setCopied(null), 2000);
  };

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

          {/* Apple Health Sync Section */}
          <div className="glass-card p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Sync iPhone (Raccourcis iOS)</h2>
            </div>

            {/* Endpoint URL */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">URL de l'endpoint</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono break-all text-foreground">
                  {endpointUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(endpointUrl, "URL")}
                  className="shrink-0"
                >
                  {copied === "URL" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* API Key */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Clé API personnelle</Label>
              {apiKey ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-lg font-mono break-all text-foreground">
                    {apiKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(apiKey, "Clé API")}
                    className="shrink-0"
                  >
                    {copied === "Clé API" ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateKey}
                    disabled={apiKeyLoading}
                    className="shrink-0"
                  >
                    <RefreshCw className={`h-4 w-4 ${apiKeyLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              ) : (
                <Button onClick={handleGenerateKey} disabled={apiKeyLoading} variant="outline" className="w-full">
                  <Key className="h-4 w-4 mr-2" />
                  Générer une clé API
                </Button>
              )}
            </div>

            {/* Last sync */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {syncStatus.data?.lastSync
                  ? `Dernière synchronisation réussie : ${syncStatus.data.lastSync.toLocaleString("fr-FR")}`
                  : "Aucune synchronisation pour l'instant"}
              </span>
            </div>

            {/* Instructions */}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors font-medium">
                Comment configurer le Raccourci iOS ?
              </summary>
              <ol className="mt-2 space-y-1.5 pl-4 list-decimal">
                <li>Ouvrez l'app <strong>Raccourcis</strong> sur votre iPhone</li>
                <li>Créez un nouveau raccourci</li>
                <li>Ajoutez l'action <strong>« Obtenir les échantillons de santé »</strong> pour chaque type (Course, Tennis, HRV, Sommeil…)</li>
                <li>Ajoutez l'action <strong>« Obtenir le contenu de l'URL »</strong></li>
                <li>Collez l'URL ci-dessus, méthode <strong>POST</strong></li>
                <li>Ajoutez le header <code className="bg-muted px-1 rounded">x-api-key</code> avec votre clé API</li>
                <li>Corps : JSON avec <code className="bg-muted px-1 rounded">workouts</code> et <code className="bg-muted px-1 rounded">metrics</code></li>
              </ol>
              <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[11px]">{`{
  "workouts": [
    {
      "type": "Running",
      "startDate": "2025-03-01T08:00:00Z",
      "endDate": "2025-03-01T09:00:00Z",
      "totalDistance": 10000,
      "averageHeartRate": 155,
      "totalEnergyBurned": 450
    },
    {
      "type": "Tennis",
      "startDate": "2025-03-02T18:00:00Z",
      "duration": 5400,
      "averageHeartRate": 140
    }
  ],
  "metrics": [
    {
      "date": "2025-03-01",
      "hrv": 42,
      "restingHeartRate": 52,
      "InBedStart": "2025-03-01T23:00:00Z",
      "InBedEnd": "2025-03-02T06:30:00Z"
    }
  ]
}`}</pre>
            </details>
          </div>

          {/* Manual JSON import (kept) */}
          <div className="glass-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Import manuel de données</h2>
            <p className="text-sm text-muted-foreground">
              Glissez un fichier JSON contenant vos activités et métriques de santé.
            </p>
            <JsonDropZone />
          </div>

          {/* Dev-only: Mock data generator */}
          {isDev && (
            <div className="glass-card p-6 space-y-4 border-dashed border-2 border-primary/30">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Données de test (Dev)</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Génère 30 jours de données réalistes : 3 runs/sem, 2 tennis/padel, 2 musculation, 1 natation + métriques santé.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!user) return;
                    setMockLoading(true);
                    try {
                      await clearTestData(user.id);
                      const res = await generateTestData(user.id);
                      queryClient.invalidateQueries();
                      toast.success(`${res.activities} activités et ${res.metrics} métriques générées !`);
                    } catch {
                      toast.error("Erreur lors de la génération");
                    }
                    setMockLoading(false);
                  }}
                  disabled={mockLoading}
                  className="flex-1"
                >
                  <Database className="h-4 w-4 mr-2" />
                  {mockLoading ? "Génération..." : "Générer des données de test"}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!user) return;
                    setMockLoading(true);
                    await clearTestData(user.id);
                    queryClient.invalidateQueries();
                    toast.success("Données supprimées");
                    setMockLoading(false);
                  }}
                  disabled={mockLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
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

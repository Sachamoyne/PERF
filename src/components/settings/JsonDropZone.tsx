import { useCallback, useState, useRef } from "react";
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ImportResult {
  success: boolean;
  activities_imported: number;
  metrics_imported: number;
  errors?: string[];
}

export function JsonDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<{ activities: number; metrics: number } | null>(null);
  const [fileContent, setFileContent] = useState<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".json")) {
      toast.error("Seuls les fichiers .json sont acceptés");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Fichier trop volumineux (max 10 Mo)");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        const activities = Array.isArray(json.activities) ? json.activities : [];
        const metrics = Array.isArray(json.metrics) ? json.metrics : [];

        if (activities.length === 0 && metrics.length === 0) {
          toast.error("Aucune donnée trouvée. Le JSON doit contenir 'activities' et/ou 'metrics'.");
          return;
        }

        setFileContent(json);
        setPreview({ activities: activities.length, metrics: metrics.length });
        setResult(null);
      } catch {
        toast.error("Fichier JSON invalide");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleImport = async () => {
    if (!fileContent) return;
    setLoading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Vous devez être connecté pour importer des données");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("manual-import", {
        body: fileContent,
      });

      if (error) throw error;

      const res = data as ImportResult;
      setResult(res);

      if (res.success && (!res.errors || res.errors.length === 0)) {
        toast.success(`Import réussi ! ${res.activities_imported} activités, ${res.metrics_imported} métriques`);
      } else if (res.success && res.errors) {
        toast.warning(`Import partiel : ${res.activities_imported} activités, ${res.metrics_imported} métriques (${res.errors.length} erreurs)`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Erreur d'import : ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFileContent(null);
    setPreview(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-3">
          {preview ? (
            <FileJson className="h-10 w-10 text-primary" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {preview ? "Fichier chargé" : "Glissez votre fichier JSON ici"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {preview
                ? `${preview.activities} activités, ${preview.metrics} métriques détectées`
                : "ou cliquez pour sélectionner un fichier"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      {preview && !result && (
        <div className="flex gap-2">
          <Button onClick={handleImport} disabled={loading} className="flex-1">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Importer
          </Button>
          <Button variant="outline" onClick={reset} disabled={loading}>Annuler</Button>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-lg p-4 text-sm space-y-2 ${result.errors?.length ? "bg-orange-500/10 border border-orange-500/30" : "bg-green-500/10 border border-green-500/30"}`}>
          <div className="flex items-center gap-2">
            {result.errors?.length ? (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            <span className="font-medium text-foreground">
              {result.activities_imported} activités, {result.metrics_imported} métriques importées
            </span>
          </div>
          {result.errors && result.errors.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              {result.errors.length > 5 && <li>...et {result.errors.length - 5} autres erreurs</li>}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={reset} className="mt-2">Nouvel import</Button>
        </div>
      )}

      {/* Format help */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer hover:text-foreground transition-colors">Format JSON attendu</summary>
        <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[11px]">{`{
  "activities": [
    {
      "sport_type": "running",
      "start_time": "2025-03-01T08:00:00Z",
      "duration_sec": 3600,
      "distance_meters": 10000,
      "calories": 450,
      "avg_hr": 155
    }
  ],
  "metrics": [
    {
      "date": "2025-03-01",
      "hrv": 42,
      "resting_heart_rate": 52,
      "sleep_score": 85
    }
  ]
}`}</pre>
      </details>
    </div>
  );
}

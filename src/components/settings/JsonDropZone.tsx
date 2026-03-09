import { useCallback, useState, useRef, useMemo } from "react";
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImportResult {
  success: boolean;
  activities_imported: number;
  metrics_imported: number;
  duplicates_skipped: number;
  errors?: string[];
}

interface PreviewRow {
  date: string;
  type: string;
  sportOrMetric: string;
  value: string;
  valid: boolean;
  reason?: string;
}

// Mirror the edge function sport detection locally for preview
function detectSport(item: Record<string, unknown>): string | null {
  const raw = (
    (item.sport_type as string) ||
    (item.type as string) ||
    (item.activity_type as string) ||
    (item.name as string) ||
    (item.activityName as string) ||
    ""
  ).toLowerCase().trim();

  if (/tennis/i.test(raw)) return "Tennis";
  if (/padel/i.test(raw)) return "Padel";
  if (/running|course|run|trail|jogging/i.test(raw)) return "Running";
  if (/cycling|vélo|bik/i.test(raw)) return "Cycling";
  if (/swim|natation/i.test(raw)) return "Swimming";
  if (/strength|musculation|functional.*strength|renforcement|weight.*training|hiit/i.test(raw)) return "Musculation";
  return null;
}

function extractDuration(item: Record<string, unknown>): number {
  if (typeof item.duration_sec === "number") return item.duration_sec;
  if (typeof item.duration === "number") return item.duration;
  if (typeof item.durationInSeconds === "number") return item.durationInSeconds;
  if (typeof item.duration_min === "number") return item.duration_min * 60;
  if (typeof item.duration === "string") {
    const parts = (item.duration as string).split(":").map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  return 0;
}

function extractDistance(item: Record<string, unknown>): number | null {
  if (typeof item.distance_meters === "number") return item.distance_meters;
  if (typeof item.distance === "number") return item.distance;
  if (typeof item.distanceInMeters === "number") return item.distanceInMeters;
  if (typeof item.distance_km === "number") return item.distance_km * 1000;
  return null;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

function formatPace(durationSec: number, distanceMeters: number): string {
  if (distanceMeters <= 0) return "—";
  const paceSecPerKm = durationSec / (distanceMeters / 1000);
  const mins = Math.floor(paceSecPerKm / 60);
  const secs = Math.round(paceSecPerKm % 60);
  return `${mins}'${secs.toString().padStart(2, "0")}" /km`;
}

function buildPreviewRows(json: Record<string, unknown>): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const activities = Array.isArray(json.activities) ? json.activities : [];
  const metrics = Array.isArray(json.metrics) ? json.metrics : [];

  for (const item of activities as Record<string, unknown>[]) {
    const sport = detectSport(item);
    const date = ((item.start_time || item.date || item.startDate || "") as string).split("T")[0] || "—";
    const durationSec = extractDuration(item);
    const distMeters = extractDistance(item);
    const avgHr = item.avg_hr ?? item.average_heart_rate ?? item.fc_moyenne ?? null;

    let value = formatDuration(durationSec);
    if (typeof avgHr === "number") value += ` · FC ${Math.round(avgHr as number)} bpm`;
    if (sport === "Running" && distMeters && distMeters > 0) {
      value += ` · ${formatPace(durationSec, distMeters)}`;
    }
    if (distMeters && distMeters > 0) {
      value += ` · ${(distMeters / 1000).toFixed(1)} km`;
    }

    rows.push({
      date,
      type: "Activité",
      sportOrMetric: sport || `❌ ${(item.sport_type || item.type || item.name || "inconnu") as string}`,
      value,
      valid: !!sport && durationSec > 0,
      reason: !sport ? "Sport non reconnu" : durationSec <= 0 ? "Durée manquante" : undefined,
    });
  }

  for (const item of metrics as Record<string, unknown>[]) {
    const date = ((item.date || item.calendarDate || "") as string) || "—";

    // HRV
    const hrvObj = item.heart_rate_variability as Record<string, unknown> | undefined;
    const hrvVal = (item.hrv ?? item.heart_rate_variability_sdnn ?? item.vrc ?? item.sdnn ?? hrvObj?.sdnn ?? hrvObj?.SDNN ?? null) as number | null;
    if (typeof hrvVal === "number" && hrvVal > 0) {
      rows.push({ date, type: "Métrique", sportOrMetric: "HRV (SDNN)", value: `${Math.round(hrvVal * 10) / 10} ms`, valid: true });
    }

    // Sleep
    const sleepMin = (item.sleep_duration_min ?? item.sleep_minutes ?? item.sommeil_minutes ?? null) as number | null;
    const sleepScore = (item.sleep_score ?? item.sleep_quality ?? null) as number | null;
    if (typeof sleepMin === "number") {
      rows.push({ date, type: "Métrique", sportOrMetric: "Sommeil", value: `${(sleepMin / 60).toFixed(1)} h (${sleepMin} min)`, valid: true });
    } else if (typeof sleepScore === "number") {
      rows.push({ date, type: "Métrique", sportOrMetric: "Sommeil", value: `Score ${sleepScore}`, valid: true });
    }

    // RHR
    const rhr = (item.resting_heart_rate ?? item.rhr ?? null) as number | null;
    if (typeof rhr === "number") {
      rows.push({ date, type: "Métrique", sportOrMetric: "FC repos", value: `${Math.round(rhr)} bpm`, valid: true });
    }

    // VO2max
    const vo2 = (item.vo2max ?? item.vo2_max ?? null) as number | null;
    if (typeof vo2 === "number") {
      rows.push({ date, type: "Métrique", sportOrMetric: "VO2max", value: `${(Math.round(vo2 * 10) / 10)} ml/kg/min`, valid: true });
    }

    // Body battery
    const bb = (item.body_battery ?? null) as number | null;
    if (typeof bb === "number") {
      rows.push({ date, type: "Métrique", sportOrMetric: "Body Battery", value: `${Math.round(bb)} %`, valid: true });
    }
  }

  return rows;
}

export function JsonDropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileContent, setFileContent] = useState<Record<string, unknown> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previewRows = useMemo(() => {
    if (!fileContent) return [];
    return buildPreviewRows(fileContent);
  }, [fileContent]);

  const validCount = useMemo(() => previewRows.filter((r) => r.valid).length, [previewRows]);
  const invalidCount = useMemo(() => previewRows.filter((r) => !r.valid).length, [previewRows]);
  const isValid = previewRows.length > 0 && validCount > 0;

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
        toast.success(`Import réussi ! ${res.activities_imported} activités, ${res.metrics_imported} métriques${res.duplicates_skipped > 0 ? ` (${res.duplicates_skipped} doublons ignorés)` : ""}`);
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
        onClick={() => !fileContent && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
          ${fileContent ? "border-primary/40 bg-primary/5" : "cursor-pointer"}
          ${isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : !fileContent ? "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50" : ""
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
          {fileContent ? (
            <FileJson className="h-10 w-10 text-primary" />
          ) : (
            <Upload className="h-10 w-10 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {fileContent ? "Fichier chargé — prévisualisation ci-dessous" : "Glissez votre fichier JSON ici"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {fileContent
                ? `${validCount} éléments valides${invalidCount > 0 ? `, ${invalidCount} ignorés` : ""}`
                : "ou cliquez pour sélectionner un fichier"
              }
            </p>
          </div>
        </div>
      </div>

      {/* Preview table */}
      {fileContent && previewRows.length > 0 && !result && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Prévisualisation</h3>
          <ScrollArea className="max-h-[320px] rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[90px]">Type</TableHead>
                  <TableHead>Détail</TableHead>
                  <TableHead>Valeur détectée</TableHead>
                  <TableHead className="w-[60px]">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row, i) => (
                  <TableRow key={i} className={!row.valid ? "opacity-50" : ""}>
                    <TableCell className="text-xs font-mono">{row.date}</TableCell>
                    <TableCell>
                      <Badge variant={row.type === "Activité" ? "default" : "secondary"} className="text-[10px]">
                        {row.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.sportOrMetric}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.value}</TableCell>
                    <TableCell>
                      {row.valid ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={loading || !isValid} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmer l'importation ({validCount})
            </Button>
            <Button variant="outline" onClick={reset} disabled={loading}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-lg p-4 text-sm space-y-2 border ${result.errors?.length ? "bg-accent/50 border-accent" : "bg-primary/5 border-primary/30"}`}>
          <div className="flex items-center gap-2">
            {result.errors?.length ? (
              <AlertCircle className="h-4 w-4 text-accent-foreground" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <span className="font-medium text-foreground">
              {result.activities_imported} activités, {result.metrics_imported} métriques importées
              {result.duplicates_skipped > 0 && (
                <span className="text-muted-foreground font-normal"> · {result.duplicates_skipped} doublons ignorés</span>
              )}
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
      {!fileContent && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">Format JSON attendu</summary>
          <pre className="mt-2 p-3 bg-muted rounded-lg overflow-x-auto text-[11px]">{`{
  "activities": [
    {
      "name": "Running",
      "start_time": "2025-03-01T08:00:00Z",
      "duration_sec": 3600,
      "distance_meters": 10000,
      "avg_hr": 155,
      "calories": 450
    },
    {
      "name": "Tennis",
      "start_time": "2025-03-02T18:00:00Z",
      "duration_sec": 5400,
      "avg_hr": 140
    },
    {
      "name": "Functional Strength Training",
      "start_time": "2025-03-03T07:00:00Z",
      "duration_sec": 2700
    }
  ],
  "metrics": [
    {
      "date": "2025-03-01",
      "hrv": 42,
      "resting_heart_rate": 52,
      "sleep_duration_min": 420,
      "vo2max": 48.5
    }
  ]
}`}</pre>
        </details>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Heart, Leaf } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useJournalEntry, useJournalHistory, useUpsertJournal, type JournalEntry } from "@/hooks/useJournal";

const MOODS = [
  { value: "radieux", label: "Radieux", emoji: "🌟" },
  { value: "bien", label: "Bien", emoji: "😊" },
  { value: "neutre", label: "Neutre", emoji: "😐" },
  { value: "fatigué", label: "Fatigué", emoji: "😔" },
  { value: "difficile", label: "Difficile", emoji: "🌧" },
] as const;

type MoodType = (typeof MOODS)[number]["value"];

function toOffsetFromToday(dateStr: string): number {
  const today = new Date();
  const target = new Date(dateStr);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  return -Math.max(0, diffDays);
}

export default function Journal() {
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState("today");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<JournalEntry | null>(null);

  const isToday = offset === 0;
  const selectedDate = isToday ? new Date() : subDays(new Date(), Math.abs(offset));
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const dateLabel = isToday ? "Aujourd'hui" : format(selectedDate, "d MMMM", { locale: fr });

  const { data: entry, isLoading: isLoadingEntry } = useJournalEntry(selectedDateStr);
  const { data: history = [] } = useJournalHistory(90);
  const upsertJournal = useUpsertJournal();

  const [mood, setMood] = useState<MoodType | null>(null);
  const [intensity, setIntensity] = useState<number>(5);
  const [freeText, setFreeText] = useState("");
  const [gratitude1, setGratitude1] = useState("");
  const [gratitude2, setGratitude2] = useState("");
  const [gratitude3, setGratitude3] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    // Ne pas écraser pendant le chargement
    if (isLoadingEntry) return;

    setMood((entry?.mood as MoodType | null) ?? null);
    setIntensity(entry?.mood_intensity ?? 5);
    setFreeText(entry?.free_text ?? "");
    setGratitude1(entry?.gratitude_1 ?? "");
    setGratitude2(entry?.gratitude_2 ?? "");
    setGratitude3(entry?.gratitude_3 ?? "");
    setDirty(false);
  }, [selectedDateStr, isLoadingEntry]);

  const payload = useMemo(
    () => ({
      date: selectedDateStr,
      mood,
      mood_intensity: mood ? intensity : null,
      free_text: freeText.trim() || null,
      gratitude_1: gratitude1.trim() || null,
      gratitude_2: gratitude2.trim() || null,
      gratitude_3: gratitude3.trim() || null,
    }),
    [selectedDateStr, mood, intensity, freeText, gratitude1, gratitude2, gratitude3]
  );

  useEffect(() => {
    if (!dirty) return;
    const capturedDate = selectedDateStr; // capture la date au moment du déclenchement

    const hasContent = !!(
      payload.mood ||
      payload.free_text ||
      payload.gratitude_1 ||
      payload.gratitude_2 ||
      payload.gratitude_3
    );
    if (!hasContent) return;

    const timer = setTimeout(() => {
      // Vérifier que la date n'a pas changé depuis le déclenchement
      if (capturedDate !== payload.date) return;
      upsertJournal.mutate(payload, {
        onError: () => {
          // autosave silencieux
        },
      });
      setDirty(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, [dirty, payload, upsertJournal, selectedDateStr]);

  const handleSave = () => {
    upsertJournal.mutate(payload, {
      onSuccess: () => toast.success("Journal enregistré ✓"),
    });
  };

  return (
    <div className="space-y-4 bg-background">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground">Journal</h1>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="today">Aujourd'hui</TabsTrigger>
            <TabsTrigger value="history">Historique</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsContent value="today" className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium min-w-[120px] text-center">{dateLabel}</span>
            <button
              onClick={() => setOffset((o) => Math.min(o + 1, 0))}
              disabled={isToday}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className={`rounded-2xl border border-border shadow-sm p-4 space-y-4 transition-opacity duration-200 ${isLoadingEntry ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="space-y-2">
              <p className="text-sm font-medium">Humeur</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {MOODS.map((m) => {
                  const selected = mood === m.value;
                  return (
                    <button
                      key={m.value}
                      onClick={() => {
                        setMood(m.value);
                        setDirty(true);
                      }}
                      className={`rounded-xl border border-border px-3 py-2 text-left transition-all duration-200 ${
                        selected ? "ring-2 ring-primary bg-primary/10" : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="text-lg leading-none">{m.emoji}</div>
                      <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
                    </button>
                  );
                })}
              </div>

              {mood && (
                <div className="space-y-2 pt-1">
                  <p className="text-sm text-muted-foreground">Intensité</p>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[intensity]}
                    onValueChange={(v) => {
                      setIntensity(v[0] ?? 5);
                      setDirty(true);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">{intensity}/10</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Comment tu te sens ?</p>
              <Textarea
                className="min-h-[120px] border-0 bg-transparent focus-visible:ring-1 focus-visible:ring-primary/30"
                placeholder="Écris ce qui te vient... tes pensées, tes émotions, ce qui t'occupe l'esprit."
                value={freeText}
                onChange={(e) => {
                  setFreeText(e.target.value);
                  setDirty(true);
                }}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">3 choses pour lesquelles tu es reconnaissant aujourd'hui</p>
              <div className="space-y-2">
                <div className="relative">
                  <Heart className="h-4 w-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    className="pl-9"
                    placeholder="Une personne, un moment, une sensation..."
                    value={gratitude1}
                    onChange={(e) => {
                      setGratitude1(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="relative">
                  <Leaf className="h-4 w-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    className="pl-9"
                    placeholder="Quelque chose de simple..."
                    value={gratitude2}
                    onChange={(e) => {
                      setGratitude2(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
                <div className="relative">
                  <Leaf className="h-4 w-4 text-primary absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    className="pl-9"
                    placeholder="Ce qui t'a surpris aujourd'hui..."
                    value={gratitude3}
                    onChange={(e) => {
                      setGratitude3(e.target.value);
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={upsertJournal.isPending || isLoadingEntry}>
              Enregistrer
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {history.map((h) => {
              const moodMeta = MOODS.find((m) => m.value === h.mood);
              const excerpt = (h.free_text ?? "").trim();
              return (
                <button
                  key={h.id}
                  onClick={() => {
                    setSelectedHistoryEntry(h);
                    setSheetOpen(true);
                  }}
                  className="w-full text-left rounded-2xl shadow-sm border border-border p-4 space-y-2 transition-all duration-200 hover:bg-accent/30"
                >
                  <p className="text-lg font-medium">{format(new Date(h.date), "EEEE d MMMM", { locale: fr })}</p>
                  <p className="text-sm text-muted-foreground">
                    {moodMeta ? `${moodMeta.emoji} ${moodMeta.label}` : "Humeur non renseignée"}
                  </p>
                  {excerpt && <p className="text-sm text-foreground line-clamp-2">{excerpt}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {[h.gratitude_1, h.gratitude_2, h.gratitude_3]
                      .filter(Boolean)
                      .map((g) => (
                        <span key={g} className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">
                          {g}
                        </span>
                      ))}
                  </div>
                </button>
              );
            })}

            {history.length === 0 && (
              <div className="rounded-2xl border border-border p-6 text-center text-muted-foreground">
                Aucune entrée pour le moment.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[90dvh] overflow-y-auto rounded-t-2xl">
          {selectedHistoryEntry && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{format(new Date(selectedHistoryEntry.date), "EEEE d MMMM", { locale: fr })}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {MOODS.find((m) => m.value === selectedHistoryEntry.mood)?.emoji ?? "😐"}{" "}
                  {MOODS.find((m) => m.value === selectedHistoryEntry.mood)?.label ?? "Humeur"}
                </p>
              </SheetHeader>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Pensées</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedHistoryEntry.free_text || "—"}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground mb-1">Gratitude</p>
                  <ol className="space-y-1 text-sm">
                    {[selectedHistoryEntry.gratitude_1, selectedHistoryEntry.gratitude_2, selectedHistoryEntry.gratitude_3]
                      .filter(Boolean)
                      .map((g, i) => (
                        <li key={`${g}-${i}`}>
                          {i + 1}. {g}
                        </li>
                      ))}
                  </ol>
                </div>
              </div>

              <SheetFooter>
                <Button
                  className="w-full"
                  onClick={() => {
                    setOffset(toOffsetFromToday(selectedHistoryEntry.date));
                    setTab("today");
                    setSheetOpen(false);
                  }}
                >
                  Modifier
                </Button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

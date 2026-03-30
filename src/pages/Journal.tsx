import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseLocalDate } from "@/lib/utils";

type EmotionCategory = "positive" | "neutral" | "difficult";
type MoodPeriod = "week" | "month" | "year";

type Emotion = {
  value: string;
  label: string;
  emoji: string;
  category: EmotionCategory;
};

const EMOTIONS: Emotion[] = [
  { value: "radieux", label: "Radieux", emoji: "🌟", category: "positive" },
  { value: "bien", label: "Bien", emoji: "😊", category: "positive" },
  { value: "motive", label: "Motivé", emoji: "💪", category: "positive" },
  { value: "focus", label: "Focus", emoji: "🎯", category: "positive" },
  { value: "serein", label: "Serein", emoji: "😌", category: "positive" },
  { value: "reconnaissant", label: "Reconnaissant", emoji: "🙏", category: "positive" },
  { value: "energique", label: "Énergique", emoji: "🔥", category: "positive" },
  { value: "joyeux", label: "Joyeux", emoji: "😄", category: "positive" },

  { value: "neutre", label: "Neutre", emoji: "😐", category: "neutral" },
  { value: "reflexif", label: "Réflexif", emoji: "🤔", category: "neutral" },
  { value: "fatigue", label: "Fatigué", emoji: "😴", category: "neutral" },
  { value: "vide", label: "Vide", emoji: "😶", category: "neutral" },

  { value: "anxieux", label: "Anxieux", emoji: "😟", category: "difficult" },
  { value: "frustre", label: "Frustré", emoji: "😤", category: "difficult" },
  { value: "triste", label: "Triste", emoji: "😔", category: "difficult" },
  { value: "epuise", label: "Épuisé", emoji: "😩", category: "difficult" },
  { value: "colere", label: "En colère", emoji: "😠", category: "difficult" },
  { value: "stresse", label: "Stressé", emoji: "😰", category: "difficult" },
  { value: "malade", label: "Malade", emoji: "🤒", category: "difficult" },
  { value: "difficile", label: "Difficile", emoji: "🌧️", category: "difficult" },
];

const EMOTION_BY_VALUE = new Map(EMOTIONS.map((e) => [e.value, e]));

const LEGACY_MOOD_TO_TAG: Record<string, string> = {
  radieux: "radieux",
  bien: "bien",
  neutre: "neutre",
  "fatigué": "fatigue",
  difficile: "difficile",
};

const CATEGORY_TO_LEGACY_MOOD: Record<EmotionCategory, string> = {
  positive: "bien",
  neutral: "neutre",
  difficult: "difficile",
};

const LEGACY_ALLOWED = new Set(["radieux", "bien", "neutre", "fatigué", "difficile"]);

const EMOTIONS_BY_CATEGORY: Array<{ key: EmotionCategory; label: string }> = [
  { key: "positive", label: "Positives" },
  { key: "neutral", label: "Neutres" },
  { key: "difficult", label: "Difficiles" },
];

function toOffsetFromToday(dateStr: string): number {
  const today = new Date();
  const target = parseLocalDate(dateStr);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  return -Math.max(0, diffDays);
}

function toLegacyMoodFromTags(tags: string[]): string | null {
  if (tags.length === 0) return null;
  const first = tags[0];
  if (LEGACY_ALLOWED.has(first)) return first;
  const category = EMOTION_BY_VALUE.get(first)?.category ?? "neutral";
  return CATEGORY_TO_LEGACY_MOOD[category];
}

function scoreColor(category: EmotionCategory): string {
  if (category === "positive") return "hsl(var(--primary))";
  if (category === "neutral") return "hsl(var(--warning))";
  return "hsl(var(--critical))";
}

function useEmotionFrequency(period: MoodPeriod) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["journal_emotion_frequency", period, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      if (period === "week") since.setDate(since.getDate() - 7);
      if (period === "month") since.setDate(since.getDate() - 30);
      if (period === "year") since.setDate(since.getDate() - 365);

      const sinceStr = format(since, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("journal_entries")
        .select("date, mood, mood_tags")
        .eq("user_id", user!.id)
        .gte("date", sinceStr)
        .order("date", { ascending: false });

      if (error) throw error;

      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const tags = Array.isArray(row.mood_tags)
          ? row.mood_tags.filter((t): t is string => typeof t === "string" && t.length > 0)
          : [];
        const effective = tags.length > 0
          ? tags
          : row.mood
            ? [LEGACY_MOOD_TO_TAG[row.mood] ?? row.mood]
            : [];

        for (const tag of effective) {
          if (!EMOTION_BY_VALUE.has(tag)) continue;
          counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }

      return Array.from(counts.entries())
        .map(([emotion, count]) => ({
          emotion,
          count,
          meta: EMOTION_BY_VALUE.get(emotion)!,
        }))
        .sort((a, b) => b.count - a.count);
    },
  });
}

export default function Journal() {
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState("today");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState<JournalEntry | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<MoodPeriod>("month");

  const isToday = offset === 0;
  const selectedDate = isToday ? new Date() : subDays(new Date(), Math.abs(offset));
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const dateLabel = isToday ? "Aujourd'hui" : format(selectedDate, "d MMMM", { locale: fr });

  const { data: entry, isLoading: isLoadingEntry } = useJournalEntry(selectedDateStr);
  const { data: history = [] } = useJournalHistory(90);
  const { data: frequency = [] } = useEmotionFrequency(historyPeriod);
  const upsertJournal = useUpsertJournal();

  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [intensity, setIntensity] = useState<number>(5);
  const [freeText, setFreeText] = useState("");
  const [gratitude1, setGratitude1] = useState("");
  const [gratitude2, setGratitude2] = useState("");
  const [gratitude3, setGratitude3] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (isLoadingEntry) return;

    const nextTags = Array.isArray(entry?.mood_tags) && entry?.mood_tags.length > 0
      ? entry!.mood_tags.filter((tag): tag is string => typeof tag === "string")
      : entry?.mood
        ? [LEGACY_MOOD_TO_TAG[entry.mood] ?? entry.mood]
        : [];

    setSelectedMoods(nextTags.slice(0, 3));
    setIntensity(entry?.mood_intensity ?? 5);
    setFreeText(entry?.free_text ?? "");
    setGratitude1(entry?.gratitude_1 ?? "");
    setGratitude2(entry?.gratitude_2 ?? "");
    setGratitude3(entry?.gratitude_3 ?? "");
    setDirty(false);
  }, [selectedDateStr, isLoadingEntry, entry]);

  const payload = useMemo(
    () => ({
      date: selectedDateStr,
      mood: toLegacyMoodFromTags(selectedMoods),
      mood_tags: selectedMoods.length > 0 ? selectedMoods : null,
      mood_intensity: selectedMoods.length > 0 ? intensity : null,
      free_text: freeText.trim() || null,
      gratitude_1: gratitude1.trim() || null,
      gratitude_2: gratitude2.trim() || null,
      gratitude_3: gratitude3.trim() || null,
    }),
    [selectedDateStr, selectedMoods, intensity, freeText, gratitude1, gratitude2, gratitude3]
  );

  useEffect(() => {
    if (!dirty) return;
    const capturedDate = selectedDateStr;

    const hasContent = !!(
      payload.mood ||
      (payload.mood_tags && payload.mood_tags.length > 0) ||
      payload.free_text ||
      payload.gratitude_1 ||
      payload.gratitude_2 ||
      payload.gratitude_3
    );
    if (!hasContent) return;

    const timer = setTimeout(() => {
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

  const handleToggleEmotion = (value: string) => {
    setSelectedMoods((prev) => {
      if (prev.includes(value)) {
        setDirty(true);
        return prev.filter((v) => v !== value);
      }
      if (prev.length >= 3) return prev;
      setDirty(true);
      return [...prev, value];
    });
  };

  const maxFrequency = frequency.length > 0 ? Math.max(...frequency.map((f) => f.count)) : 1;

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
              className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium min-w-[120px] text-center">{dateLabel}</span>
            <button
              onClick={() => setOffset((o) => Math.min(o + 1, 0))}
              disabled={isToday}
              className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className={`rounded-2xl border border-border shadow-sm p-4 space-y-4 transition-opacity duration-200 ${isLoadingEntry ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Émotions (max 3)</p>
                <p className="text-xs text-muted-foreground">{selectedMoods.length}/3</p>
              </div>
              <div className="space-y-0">
                {EMOTIONS_BY_CATEGORY.map((section, index) => (
                  <div key={section.key}>
                    <p className={`mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground ${index === 0 ? "mt-0" : "mt-3"}`}>
                      {section.label}
                    </p>
                    <div className="grid grid-cols-4 md:grid-cols-5 gap-1.5">
                      {EMOTIONS.filter((emotion) => emotion.category === section.key).map((emotion) => {
                        const selected = selectedMoods.includes(emotion.value);
                        const disabled = !selected && selectedMoods.length >= 3;
                        return (
                          <button
                            key={emotion.value}
                            onClick={() => handleToggleEmotion(emotion.value)}
                            disabled={disabled}
                            className={`h-[72px] rounded-[8px] border p-2 flex flex-col items-center justify-center text-center transition-all ${
                              selected
                                ? "border-primary bg-primary/15"
                                : "border-border bg-[#161616] hover:bg-accent/40"
                            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                          >
                            <span className="text-[22px] leading-none">{emotion.emoji}</span>
                            <span className="text-[11px] mt-1 text-muted-foreground leading-tight">{emotion.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {selectedMoods.length > 0 && (
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
          <div className="rounded-2xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-semibold text-foreground">Fréquence des émotions</h2>
              <div className="flex gap-1 rounded-lg bg-secondary p-1">
                {([
                  { key: "week", label: "Semaine" },
                  { key: "month", label: "Mois" },
                  { key: "year", label: "Année" },
                ] as const).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setHistoryPeriod(opt.key)}
                    className={`period-pill ${historyPeriod === opt.key ? "period-pill-active" : ""}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {frequency.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune émotion sur cette période.</p>
            ) : (
              <div className="space-y-2">
                {frequency.map((item) => {
                  const pct = Math.max(8, Math.round((item.count / maxFrequency) * 100));
                  return (
                    <div key={item.emotion} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
                      <div className="text-xs text-muted-foreground truncate">
                        {item.meta.emoji} {item.meta.label}
                      </div>
                      <div className="h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: scoreColor(item.meta.category) }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">{item.count}x</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {history.map((h) => {
              const tags = Array.isArray(h.mood_tags) && h.mood_tags.length > 0
                ? h.mood_tags
                : h.mood
                  ? [LEGACY_MOOD_TO_TAG[h.mood] ?? h.mood]
                  : [];
              const moodMeta = tags.length > 0 ? EMOTION_BY_VALUE.get(tags[0]) : null;
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
                  <p className="text-lg font-medium">{format(parseLocalDate(h.date), "EEEE d MMMM", { locale: fr })}</p>
                  <p className="text-sm text-muted-foreground">
                    {moodMeta ? `${moodMeta.emoji} ${moodMeta.label}` : "Humeur non renseignée"}
                  </p>
                  {tags.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.slice(0, 3).map((tag) => {
                        const meta = EMOTION_BY_VALUE.get(tag);
                        if (!meta) return null;
                        return (
                          <span key={tag} className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5">
                            {meta.emoji} {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
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
                <SheetTitle>{format(parseLocalDate(selectedHistoryEntry.date), "EEEE d MMMM", { locale: fr })}</SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const tags = Array.isArray(selectedHistoryEntry.mood_tags) && selectedHistoryEntry.mood_tags.length > 0
                      ? selectedHistoryEntry.mood_tags
                      : selectedHistoryEntry.mood
                        ? [LEGACY_MOOD_TO_TAG[selectedHistoryEntry.mood] ?? selectedHistoryEntry.mood]
                        : [];
                    if (tags.length === 0) return "😐 Humeur";
                    const first = EMOTION_BY_VALUE.get(tags[0]);
                    return first ? `${first.emoji} ${first.label}` : "😐 Humeur";
                  })()}
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

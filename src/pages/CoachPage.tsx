import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

type HistoryRow = {
  id?: string;
  role: ChatRole;
  content: string;
  created_at?: string;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Impossible de lire le fichier"));
    reader.readAsDataURL(file);
  });
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`md-strong-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`md-em-${index}`}>{part.slice(1, -1)}</em>;
    }
    return <span key={`md-text-${index}`}>{part}</span>;
  });
}

function renderAssistantMarkdown(content: string) {
  const lines = content.split("\n");
  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    const items = bulletBuffer;
    bulletBuffer = [];
    blocks.push(
      <ul key={`md-ul-${blocks.length}`} className="my-1 ml-5 list-disc space-y-1">
        {items.map((item, index) => (
          <li key={`md-li-${index}`}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>
    );
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      bulletBuffer.push(bulletMatch[1]);
      continue;
    }

    flushBullets();

    if (!line.trim()) {
      blocks.push(<div key={`md-gap-${blocks.length}`} className="h-1.5" />);
      continue;
    }

    blocks.push(
      <p key={`md-p-${blocks.length}`} className="leading-relaxed">
        {renderInlineMarkdown(line)}
      </p>
    );
  }

  flushBullets();

  return <div className="space-y-0.5">{blocks}</div>;
}

function formatImportSummary(payload: Record<string, unknown>) {
  const sport = payload.sport_type ?? "n/d";
  const start = payload.start_time ? new Date(String(payload.start_time)).toLocaleDateString("fr-FR") : "n/d";
  const duration = typeof payload.duration_sec === "number" ? `${Math.round(payload.duration_sec / 60)} min` : "n/d";
  const distance = typeof payload.distance_meters === "number" ? `${(payload.distance_meters / 1000).toFixed(2)} km` : "n/d";
  const avgHr = payload.avg_hr ?? "n/d";

  return `Import Garmin terminé.\nSport: ${sport}\nDate: ${start}\nDurée: ${duration}\nDistance: ${distance}\nFC moy: ${avgHr}`;
}

export default function CoachPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [sendAnimating, setSendAnimating] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasRunWelcomeRef = useRef(false);

  const userFirstName = useMemo(() => {
    const localPart = user?.email?.split("@")[0] ?? "";
    if (!localPart) return "athlète";
    return localPart.charAt(0).toUpperCase() + localPart.slice(1);
  }, [user?.email]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );

  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
      }
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    setLoadingHistory(true);

    const { data, error } = await supabase
      .from("ai_conversations" as never)
      .select("id,role,content,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast.error("Impossible de charger l'historique Coach");
      setLoadingHistory(false);
      return;
    }

    const history = (data as HistoryRow[] | null) ?? [];
    const normalized = history
      .map((row) => ({
        id: row.id ?? uid(),
        role: row.role,
        content: row.content,
        created_at: row.created_at ?? new Date().toISOString(),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    setMessages(normalized);
    setLoadingHistory(false);
  }, [user]);

  const sendCoachMessage = useCallback(
    async (text: string, options?: { silentUser?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || !user) return;

      const previousMessages = sortedMessages;

      if (!options?.silentUser) {
        const userMsg: ChatMessage = {
          id: uid(),
          role: "user",
          content: trimmed,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
      }

      setIsTyping(true);

      const historyPayload = previousMessages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setIsTyping(false);
        toast.error("Session expirée. Reconnecte-toi.");
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.reply) {
        setIsTyping(false);
        toast.error("Le coach IA est indisponible pour le moment");
        return;
      }

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: String(data.reply),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    },
    [sortedMessages, user]
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (loadingHistory || hasRunWelcomeRef.current) return;
    if (messages.length > 0) {
      hasRunWelcomeRef.current = true;
      return;
    }

    hasRunWelcomeRef.current = true;
    void sendCoachMessage("Bonjour, analyse mon entraînement récent et donne-moi un bilan rapide.", { silentUser: true });
  }, [loadingHistory, messages.length, sendCoachMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [sortedMessages, isTyping, scrollToBottom]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !isMobile) return;

    const updateKeyboardOffset = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(inset);
    };

    updateKeyboardOffset();
    vv.addEventListener("resize", updateKeyboardOffset);
    vv.addEventListener("scroll", updateKeyboardOffset);

    return () => {
      vv.removeEventListener("resize", updateKeyboardOffset);
      vv.removeEventListener("scroll", updateKeyboardOffset);
    };
  }, [isMobile]);

  useEffect(() => {
    if (keyboardOffset > 0) {
      scrollToBottom(false);
    }
  }, [keyboardOffset, scrollToBottom]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const message = input;
    setInput("");
    setSendAnimating(true);
    setTimeout(() => setSendAnimating(false), 170);
    await sendCoachMessage(message);
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Utilise une image JPG ou PNG");
      return;
    }

    try {
      setIsImporting(true);
      const imageBase64 = await toBase64(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.error("Session expirée. Reconnecte-toi.");
        return;
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          image: imageBase64,
          media_type: file.type,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.success) {
        toast.error("Échec de l'import Garmin");
        return;
      }

      const importedData = (data?.data ?? {}) as Record<string, unknown>;
      const summary = formatImportSummary(importedData);

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: summary,
          created_at: new Date().toISOString(),
        },
      ]);

      toast.success("Import Garmin réussi");
    } catch {
      toast.error("Échec de l'import Garmin");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-2xl" style={{ backgroundColor: "#F8F9FA" }}>
      <style>{`
        .coach-msg-enter {
          animation: coachFadeSlide 150ms ease-out;
        }

        @keyframes coachFadeSlide {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <header
        className="flex h-[60px] items-center justify-center px-4"
        style={{ backgroundColor: "#F8F9FA" }}
      >
        <h1 className="text-2xl font-display font-bold" style={{ color: "#111111" }}>Coach IA</h1>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" style={{ backgroundColor: "#F8F9FA" }}>
        {loadingHistory ? (
          <div className="text-sm" style={{ color: "#8A8A8A" }}>Chargement de l'historique...</div>
        ) : (
          <div className="space-y-3">
            {sortedMessages.length === 0 ? (
              <div
                className="coach-msg-enter rounded-2xl p-4"
                style={{
                  background: "linear-gradient(120deg, #EAFBF0 0%, #F7FFF9 100%)",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ backgroundColor: "#00C8531A" }}>
                    🧠
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#144A2E" }}>Bienvenue {userFirstName}</p>
                    <p className="mt-1 text-sm" style={{ color: "#225A3B" }}>
                      Je peux analyser tes entraînements récents, te proposer un plan d'action concret et importer tes données Garmin.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {sortedMessages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className={`coach-msg-enter flex items-end gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                  {!isUser ? (
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px]"
                      style={{ backgroundColor: "#E7F8EE" }}
                    >
                      🧠
                    </div>
                  ) : null}

                  <div
                    className="max-w-[85%] px-4 py-4 text-[14px]"
                    style={{
                      backgroundColor: isUser ? "#00C853" : "#FFFFFF",
                      color: isUser ? "#FFFFFF" : "#1A1A1A",
                      borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      boxShadow: isUser ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  >
                    {isUser ? <span className="whitespace-pre-wrap">{msg.content}</span> : renderAssistantMarkdown(msg.content)}
                  </div>
                </div>
              );
            })}

            {isTyping ? (
              <div className="coach-msg-enter flex items-end gap-2 justify-start">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px]" style={{ backgroundColor: "#E7F8EE" }}>
                  🧠
                </div>
                <div
                  className="inline-flex items-center gap-1 px-4 py-3"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "16px 16px 16px 4px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  }}
                >
                  <span className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: "#888", animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: "#888", animationDelay: "120ms" }} />
                  <span className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: "#888", animationDelay: "240ms" }} />
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div
        className="px-4 pt-3"
        style={{
          backgroundColor: "#FFFFFF",
          borderTop: "1px solid #EEEEEE",
          minHeight: 72,
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 8px)`,
          marginBottom: isMobile ? keyboardOffset : 0,
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Pose ta question..."
            disabled={isTyping || isImporting}
            className="h-11 rounded-[24px] border-0 px-4"
            style={{ backgroundColor: "#F5F5F5", color: "#1A1A1A" }}
          />

          <Button
            type="button"
            variant="outline"
            className="h-11 w-11 rounded-full p-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isTyping || isImporting}
            title="Importer depuis photo"
            style={{ borderColor: "transparent", backgroundColor: "#F0F0F0", color: "#656565" }}
          >
            <Camera className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            className={`h-11 w-11 rounded-full p-0 transition-transform duration-150 ${sendAnimating ? "rotate-12" : "rotate-0"}`}
            onClick={() => void handleSend()}
            disabled={isTyping || isImporting || !input.trim()}
            style={{ backgroundColor: "#00C853", color: "#FFFFFF" }}
          >
            <SendHorizontal className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { workerFetch } from "@/lib/worker";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Loader2, ChevronLeft, X, Paperclip, Smile, Mic, ArrowUp } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { formatDistanceToNowStrict } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function formatMsgTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  return formatDistanceToNowStrict(ts, { addSuffix: true });
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "agent";
  content: string;
  type?: "text" | "resolved" | "csat";
  sources?: Array<{ documentTitle: string; similarity: number; index: number }>;
  language?: string;
  confidence?: "high" | "medium" | "low";
  confidenceScore?: number;
  createdAt: number;
  ticketId?: string;
}

interface TicketHistoryItem {
  id: string;
  title: string;
  status: string;
  created_at: number;
}

function TypingDots() {
  return (
    <div className="flex gap-1 px-1 items-center h-5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export default function WidgetChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const widgetId = params.widget_id as string;
  const embedded = searchParams.get("embedded") === "1";
  const closeEmbed = () => window.parent.postMessage({ type: "supportai:close" }, "*");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState("en");
  const [linkedTicketId, setLinkedTicketId] = useState<string | null>(null);
  const [showCsat, setShowCsat] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [agentTyping, setAgentTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!widgetId) return;
    try {
      if (localStorage.getItem(`widget_consent_${widgetId}`) === "1") {
        setConsentAccepted(true);
      }
    } catch { /* ignore */ }
  }, [widgetId]);

  const [ticketList, setTicketList] = useState<TicketHistoryItem[]>([]);

  const fetchTicketList = useCallback(() => {
    if (!widgetId) return;
    workerFetch(`/widget/chat/tickets/${widgetId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tickets) setTicketList(data.tickets);
      })
      .catch((e) => console.error("Failed to load ticket list", e));
  }, [widgetId]);

  useEffect(() => {
    fetchTicketList();
  }, [fetchTicketList]);

  const startNewTicket = useCallback(() => {
    setTicketId(null);
    setLinkedTicketId(null);
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Hi there 👋\n\nYou are now speaking with Support AI. How can I help?",
      type: "text",
      createdAt: Date.now(),
    }]);
  }, []);

  // Initialize new ticket state on mount
  useEffect(() => {
    startNewTicket();
  }, [startNewTicket]);

  const loadTicketHistory = useCallback((id: string) => {
    setTicketId(id);
    setLinkedTicketId(id);
    workerFetch(`/tickets/${id}/conversation`)
      .then((r) => r.json())
      .then((data) => {
        if (data.timeline && data.timeline.length > 0) {
          const formattedMessages = data.timeline.map((ev: any) => ({
            id: ev.id,
            role: ev.role === "agent" ? "agent" : ev.role === "assistant" || ev.speaker === "ai" ? "assistant" : "user",
            content: ev.content,
            type: "text",
            createdAt: ev.createdAt,
          }));
          setMessages(formattedMessages);
        }
      })
      .catch((e) => console.error("Failed to load conversation", e));
  }, []);

  // Listen for agent takeover messages (Realtime push)
  useEffect(() => {
    if (!widgetId || !consentAccepted || !ticketId) return;
    const channel = supabase
      .channel(`widget_${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "widget_messages", filter: `ticket_id=eq.${ticketId}` },
        (payload) => {
          const m = payload.new;
          if (m.role === "assistant") setAgentTyping(true);
          setMessages((prev) => {
            if (prev.some((existing) => existing.id === m.id)) return prev;
            const duplicateIndex = prev.findIndex((existing) =>
              existing.role === m.role &&
              existing.content === m.content &&
              Math.abs(existing.createdAt - m.created_at) < 10000
            );
            if (duplicateIndex !== -1) {
              const next = [...prev];
              next[duplicateIndex] = { ...next[duplicateIndex], id: m.id, createdAt: m.created_at };
              return next;
            }
            return [...prev, {
              id: m.id,
              role: m.role as "user" | "assistant" | "agent",
              content: m.content,
              type: m.type || "text",
              createdAt: m.created_at,
            }];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [widgetId, ticketId, consentAccepted]);

  const acceptConsent = () => {
    setConsentAccepted(true);
    try {
      localStorage.setItem(`widget_consent_${widgetId}`, "1");
    } catch { /* ignore */ }
  };

  const submitCsat = async (score: number) => {
    if (!linkedTicketId) {
      setShowCsat(false);
      toast.success("Thanks for your feedback!");
      return;
    }
    try {
      await workerFetch(`/tickets/${linkedTicketId}`, {
        method: "PATCH",
        body: JSON.stringify({ csat: score, status: "RESOLVED" }),
      });
      toast.success("Thanks for rating your support experience!");
    } catch {
      toast.success("Thanks!");
    }
    setShowCsat(false);
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading || !consentAccepted) return;
    const text = input.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
      type: "text",
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages
        .filter((m) => m.type !== "csat")
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }));

      const embedRes = await fetch("/api/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const embedData = await embedRes.json();

      const res = await workerFetch("/widget/chat", {
        method: "POST",
        body: JSON.stringify({
          widgetId,
          message: text,
          messages: history,
          query_embedding: embedData.embedding,
          ticketId: ticketId,
        }),
      });

      const data = await res.json();
      if (data.language) setDetectedLanguage(data.language);

      if (data.ticketId && !ticketId) {
        setTicketId(data.ticketId);
        fetchTicketList();
      }
      if (data.ticketId) setLinkedTicketId(data.ticketId);

      if (data.paused) return; // Agent is active, do not render an AI message.

      const aiMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.message || "I'm sorry, I couldn't process that. Please try again.",
        type: data.type === "resolved" ? "resolved" : "text",
        sources: data.sources,
        language: data.language,
        confidence: data.confidence,
        confidenceScore: data.confidenceScore,
        ticketId: data.ticketId,
        createdAt: Date.now() + 1,
      };

      if (data.type === "resolved") setShowCsat(true);
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      toast.error("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, widgetId, consentAccepted, ticketId, fetchTicketList]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  const senderLabel = (msg: ChatMessage) => {
    if (msg.role === "agent") return "Agent • Human Agent";
    return "Support AI • AI Agent";
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: embedded ? "100vh" : "100svh",
        background: "#ffffff",
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        maxWidth: 780,
        margin: "0 auto",
        position: "relative",
      }}
    >
      <Toaster />
      <style>{`
        .widget-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .widget-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .widget-scroll::-webkit-scrollbar-thumb {
          background: transparent;
          border-radius: 99px;
          transition: background 0.2s;
        }
        .widget-scroll:hover::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.12);
        }
        .widget-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.22);
        }
        .widget-scroll {
          scrollbar-width: thin;
          scrollbar-color: transparent transparent;
        }
        .widget-scroll:hover {
          scrollbar-color: rgba(0,0,0,0.12) transparent;
        }
      `}</style>

      {/* ── Consent overlay ── */}
      {!consentAccepted && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 50,
          background: "rgba(255,255,255,0.96)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            maxWidth: 360, width: "100%", borderRadius: 16,
            border: "1px solid #e5e7eb", background: "#fff",
            padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
          }}>
            <p style={{ fontWeight: 600, fontSize: 17, color: "#111827", marginBottom: 10 }}>AI support chat</p>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6, marginBottom: 18 }}>
              This assistant may answer using our knowledge base documents. Messages can be saved so agents can help if we escalate. Do not share passwords or payment card numbers.
            </p>
            <button
              onClick={acceptConsent}
              style={{
                width: "100%", padding: "10px 0", background: "#111827",
                color: "#fff", border: "none", borderRadius: 10, fontWeight: 500,
                fontSize: 14, cursor: "pointer",
              }}
            >
              Continue to chat
            </button>
          </div>
        </div>
      )}

      {/* ── CSAT overlay ── */}
      {showCsat && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 140, zIndex: 40,
          padding: "0 16px", display: "flex", justifyContent: "center",
        }}>
          <div style={{
            background: "#fff", border: "1px solid #e5e7eb",
            boxShadow: "0 8px 30px rgba(0,0,0,0.12)", borderRadius: 16,
            padding: 16, maxWidth: 340, width: "100%",
          }}>
            <p style={{ fontSize: 13, fontWeight: 500, textAlign: "center", marginBottom: 12, color: "#111827" }}>
              How was this support experience?
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => submitCsat(n)}
                  style={{
                    height: 36, width: 36, borderRadius: 8,
                    border: "1px solid #e5e7eb", fontSize: 13, fontWeight: 500,
                    cursor: "pointer", background: "#fff", color: "#374151",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px",  
        background: "#fff", flexShrink: 0,
      }}>
        {/* Left: back button */}


        {/* Center: title */}
        <div style={{ flex: 2, minWidth: 0, margin: "0 8px", display: "flex",  gap: 8 }}>
          <div style={{ height: 20, width: 20, background: "black", borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#111827", lineHeight: 1.3, whiteSpace: "nowrap" }}>Support AI</div>
          
        </div>

        {/* Right: more + close */}
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
          
          <button
            onClick={embedded ? closeEmbed : undefined}
            aria-label="Close"
            style={{
              height: 34, width: 34, borderRadius: "50%", border: "none",
              background: "transparent", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", color: "#9ca3af",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="widget-scroll" style={{ flex: 1, overflowY: "auto", padding: "0px 16px 8px", display: "flex", flexDirection: "column", gap: 16 }}>
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              {msg.role !== "user" ? (
                /* AI / Agent bubble */
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 2px",
                    borderRadius: "18px 18px 18px 4px",
                    backgroundColor: "#ffffffff",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#000000ff",
                  }}
                  className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:font-semibold"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content.replace(/(?<!^)(?=\* )/g, "\n")}
                  </ReactMarkdown>
                </div>
              ) : (
                /* User bubble */
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 14px",
                    borderRadius: "18px 18px 4px 18px",
                    backgroundColor: "#1a1a1a",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#ffffff",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
              )}

              {/* Timestamp / sender line */}
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, padding: "0 2px" }}>
                {msg.role === "user"
                  ? formatMsgTime(msg.createdAt)
                  : `${senderLabel(msg)} • ${formatMsgTime(msg.createdAt)}`}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: "flex", alignItems: "flex-start" }}
          >
            <div style={{ padding: "12px 14px", borderRadius: "18px 18px 18px 4px", backgroundColor: "#ffffffff" }}>
              <TypingDots />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} style={{ height: 4 }} />
      </div>

      {/* ── Input area ── */}
      <div style={{ flexShrink: 0, padding: "8px 16px 6px", background: "#fff" }}>
        {/* Input box with thick border */}
        <div
          style={{
            border: "1px solid #1a1a1a",
            borderRadius: 16,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Text input */}
          <div style={{ padding: "12px 14px 4px" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask a question..."
              disabled={isLoading || !consentAccepted}
              rows={1}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 14,
                color: "#374151",
                background: "transparent",
                lineHeight: "1.5",
                minHeight: 22,
                maxHeight: 120,
                fontFamily: "inherit",
                display: "block",
              }}
            />
          </div>

          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "4px 10px 8px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* Paperclip */}
        
              {/* Smile */}
            
            </div>

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading || !consentAccepted}
              aria-label="Send message"
              style={{
                height: 32, width: 32, borderRadius: "50%", border: "none",
                cursor: input.trim() && !isLoading && consentAccepted ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: input.trim() && !isLoading && consentAccepted ? "#1a1a1a" : "#e5e7eb",
                color: input.trim() && !isLoading && consentAccepted ? "#fff" : "#9ca3af",
                transition: "all 0.15s",
                flexShrink: 0,
              }}
            >
              {isLoading
                ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
                : <ArrowUp style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: 11, color: "#9ca3af", margin: "8px 0 4px" }}>
          By chatting with us, you agree to our{" "}
          <a href="#" style={{ color: "#6b7280", textDecoration: "underline" }}>
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}

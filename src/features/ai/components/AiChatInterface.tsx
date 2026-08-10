"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, User, Loader2, Copy, Check, RefreshCw, Sparkles } from "lucide-react";
import type { Ticket } from "@/types";
import { toast } from "sonner";
import { workerFetch } from "@/lib/worker";
import { useAuth } from "@/features/auth/hooks/useAuth";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiChatInterfaceProps {
  ticket: Ticket;
  onSuggestedReply?: (reply: string) => void;
}

const SUGGESTED_PROMPTS = [
  "Summarize this ticket",
  "Suggest a resolution",
  "Draft a professional reply to the customer",
  "What is the priority level?",
];

function MessageBubble({ message, onCopy }: { message: Message; onCopy: (text: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    onCopy(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 group ${message.role === "user" ? "flex-row-reverse" : ""}`}>
      <Avatar className="h-8 w-8 shrink-0 mt-1">
        <AvatarFallback className={message.role === "assistant" ? "bg-primary/10 text-primary" : "bg-muted"}>
          {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={`flex flex-col max-w-[85%] ${message.role === "user" ? "items-end" : "items-start"}`}>
        <div
          className={`relative px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            message.role === "user"
              ? "bg-primary text-primary-foreground rounded-tr-none"
              : "bg-muted rounded-tl-none border border-border/50"
          }`}
        >
          {message.content}

          {message.role === "assistant" && message.content && (
            <button
              onClick={handleCopy}
              className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-md p-1 shadow-sm"
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 shrink-0 mt-1">
        <AvatarFallback className="bg-primary/10 text-primary">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="bg-muted border border-border/50 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce" />
      </div>
    </div>
  );
}

export function AiChatInterface({ ticket, onSuggestedReply }: AiChatInterfaceProps) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Load persisted assist history
  useEffect(() => {
    if (!session || !ticket.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await workerFetch(`/tickets/${ticket.id}/assist`, {
          token: session.access_token,
        });
        const data = await res.json();
        if (!cancelled && data.messages?.length) {
          setMessages(
            data.messages.map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }
      } catch {
        /* empty history is fine */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, ticket.id]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading || !session) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const lower = text.toLowerCase();
        let assistantContent = "";

        if (lower.includes("summarize")) {
          const res = await workerFetch("/ai/summarize", {
            method: "POST",
            token: session.access_token,
            body: JSON.stringify({ ticketId: ticket.id }),
          });
          const data = await res.json();
          const s = data.summary || {};
          assistantContent = [
            s.mainIssue && `Issue: ${s.mainIssue}`,
            s.currentStatus && `Status: ${s.currentStatus}`,
            s.recommendation && `Next: ${s.recommendation}`,
            Array.isArray(s.attemptedSolutions) && s.attemptedSolutions.length
              ? `Tried: ${s.attemptedSolutions.join("; ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n") || JSON.stringify(data.summary || data, null, 2);
        } else if (lower.includes("draft") || lower.includes("reply") || lower.includes("professional")) {
          const res = await workerFetch("/ai/suggest-reply", {
            method: "POST",
            token: session.access_token,
            body: JSON.stringify({ ticketId: ticket.id, tone: "professional" }),
          });
          const data = await res.json();
          assistantContent = data.replyTranslated || data.reply || "Could not draft a reply.";
          onSuggestedReply?.(assistantContent);
        } else {
          const res = await workerFetch("/ai/assist-chat", {
            method: "POST",
            token: session.access_token,
            body: JSON.stringify({
              ticketId: ticket.id,
              message: text.trim(),
              history: messages,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Assist failed");
          assistantContent = data.content;
          // assist-chat already persists — avoid double save
          setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
          return;
        }

        // Persist summarize / suggest-reply turns
        await workerFetch(`/tickets/${ticket.id}/assist`, {
          method: "POST",
          token: session.access_token,
          body: JSON.stringify({
            messages: [
              { role: "user", content: text.trim() },
              { role: "assistant", content: assistantContent },
            ],
          }),
        });

        setMessages((prev) => [...prev, { role: "assistant", content: assistantContent }]);
      } catch (error) {
        console.error("Chat error:", error);
        toast.error("Failed to get AI response. Please try again.");
      } finally {
        setIsLoading(false);
      }
    },
    [messages, ticket, isLoading, session, onSuggestedReply]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleRegenerate = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      setMessages((prev) => prev.slice(0, -1));
      sendMessage(lastUserMsg.content);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const hasMessages = messages.length > 0;
  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-600">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Assistant</h3>
            <p className="text-xs text-muted-foreground">Saved per ticket · Groq Llama 3.3</p>
          </div>
        </div>
        {hasMessages && lastIsAssistant && !isLoading && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={handleRegenerate}>
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 px-4 py-4">
        {!hydrated ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-8">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center text-indigo-600 shadow-sm border border-indigo-500/10">
              <Sparkles className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">AI Support Assistant</p>
              <p className="text-xs text-muted-foreground mt-1.5 max-w-[200px]">
                Ask me anything about this ticket — history is saved
              </p>
            </div>
            <div className="w-full space-y-2 pt-4">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="w-full text-left text-xs px-3 py-2.5 rounded-lg border border-border/50 bg-background hover:bg-muted/50 hover:border-indigo-500/30 transition-all text-muted-foreground hover:text-foreground shadow-sm"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map((m, idx) => (
              <MessageBubble key={idx} message={m} onCopy={handleCopy} />
            ))}
            {isLoading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {hasMessages && !isLoading && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
          {SUGGESTED_PROMPTS.slice(0, 2).map((prompt) => (
            <button
              key={prompt}
              onClick={() => sendMessage(prompt)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-card/50 hover:bg-muted/50 transition-all text-muted-foreground hover:text-foreground whitespace-nowrap shrink-0"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <div className="p-4 border-t border-border/40 shrink-0 bg-muted/20">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI about this ticket..."
            className="flex-1 bg-background/50"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} className="shrink-0">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

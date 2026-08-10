"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { workerFetch } from "@/lib/worker";
import { supabase } from "@/lib/supabase/client";
import type { ConversationEvent, Ticket } from "@/types";
import { AiChatInterface } from "@/features/ai/components/AiChatInterface";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  Bot,
  Headphones,
  Loader2,
  Sparkles,
  User,
  Languages,
  CircleDot,
  Send,
} from "lucide-react";

const SENTIMENT_EMOJI: Record<string, string> = { happy: "🙂", neutral: "😐", angry: "☹️" };

// Neutral, low-noise status system: a dot + label instead of a filled chip.
const STATUS_DOT: Record<string, string> = {
  OPEN: "bg-amber-500",
  IN_PROGRESS: "bg-indigo-500",
  RESOLVED: "bg-emerald-500",
  CLOSED: "bg-zinc-400",
};

type Speaker = "customer" | "ai" | "agent";

function resolveSpeaker(ev: ConversationEvent): Speaker {
  if (ev.speaker === "customer" || ev.speaker === "ai" || ev.speaker === "agent") {
    return ev.speaker;
  }
  if (ev.role === "user") return "customer";
  if (ev.kind === "reply") {
    const name = ev.senderName || "";
    if (/ai\s*(bot|assist|assistant)?/i.test(name) || name.toLowerCase().includes("pre-escalation")) {
      return "ai";
    }
    return "agent";
  }
  return "ai";
}

// One accent (indigo) carries the "AI" identity throughout the page.
// Agent and customer stay neutral so the accent isn't diluted.
const SPEAKER_META: Record<
  Speaker,
  {
    label: string;
    badgeClass: string;
    bubbleClass: string;
    avatarClass: string;
    align: "start" | "end";
    Icon: typeof User;
  }
> = {
  customer: {
    label: "Customer",
    badgeClass: "bg-muted text-muted-foreground",
    bubbleClass: "bg-muted/60 border border-border/60 rounded-2xl rounded-tr-sm",
    avatarClass: "bg-muted text-muted-foreground",
    align: "end",
    Icon: User,
  },
  ai: {
    label: "AI",
    badgeClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    bubbleClass:
      "bg-background border border-border/60 border-l-2 border-l-indigo-500 rounded-2xl rounded-tl-sm",
    avatarClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
    align: "start",
    Icon: Bot,
  },
  agent: {
    label: "Agent",
    badgeClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    bubbleClass:
      "bg-background border border-border/60 border-l-2 border-l-zinc-400 rounded-2xl rounded-tl-sm",
    avatarClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300",
    align: "start",
    Icon: Headphones,
  },
};

function ConversationBubble({ ev }: { ev: ConversationEvent; index: number }) {
  const speaker = resolveSpeaker(ev);
  const meta = SPEAKER_META[speaker];
  const Icon = meta.Icon;
  const isCustomer = speaker === "customer";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={cn("flex gap-2.5", isCustomer && "flex-row-reverse")}
    >
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className={cn("text-[11px]", meta.avatarClass)}>
          <Icon className="h-3.5 w-3.5" />
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex flex-col max-w-[80%] gap-1", isCustomer ? "items-end" : "items-start")}>
        <div className={cn("flex items-center gap-2 text-[11px]", isCustomer && "flex-row-reverse")}>
          <span className="font-medium text-foreground">{ev.senderName}</span>
          <span className={cn("rounded px-1.5 py-0.5 font-medium", meta.badgeClass)}>
            {meta.label}
          </span>
          <span className="text-muted-foreground">{formatDistanceToNow(ev.createdAt, { addSuffix: true })}</span>
        </div>
        <div className={cn("px-3.5 py-2.5 text-sm leading-relaxed max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5 [&_strong]:font-semibold", meta.bubbleClass)}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
          >
            {ev.content.replace(/(?<!^)(?=\* )/g, "\n")}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium capitalize truncate">{value}</span>
    </div>
  );
}

export default function TicketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { session, user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [timeline, setTimeline] = useState<ConversationEvent[]>([]);
  const [similar, setSimilar] = useState<Ticket[]>([]);
  const [similarHint, setSimilarHint] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session || !id) return;
    setLoading(true);
    try {
      const [tRes, cRes, sRes] = await Promise.all([
        workerFetch(`/tickets/${id}`, { token: session.access_token }),
        workerFetch(`/tickets/${id}/conversation`, { token: session.access_token }),
        workerFetch(`/tickets/${id}/similar`, { token: session.access_token }),
      ]);
      const tData = await tRes.json();
      const cData = await cRes.json();
      const sData = await sRes.json();
      if (!tRes.ok) throw new Error(tData.error || "Not found");
      setTicket(tData.ticket);
      setTimeline(cData.timeline || []);
      setSimilar(sData.similar || []);
      setSimilarHint(sData.hint || "");
    } catch {
      toast.error("Failed to load ticket");
      router.push("/dashboard/tickets");
    } finally {
      setLoading(false);
    }
  }, [session, id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session || !id) return;

    const channel = supabase
      .channel(`dashboard_ticket_${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "widget_messages", filter: `ticket_id=eq.${id}` },
        (payload) => {
          const m = payload.new;
          setTimeline((prev) => {
            if (prev.some((existing) => existing.id === m.id)) return prev;
            return [
              ...prev,
              {
                id: m.id,
                kind: "widget" as const,
                speaker: m.role === "user" ? ("customer" as const) : ("ai" as const),
                role: m.role,
                senderName: m.role === "user" ? "Customer" : "AI Assistant",
                content: m.content,
                createdAt: m.created_at,
              },
            ].sort((a, b) => a.createdAt - b.createdAt);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ticket_replies", filter: `ticket_id=eq.${id}` },
        (payload) => {
          const r = payload.new;
          const name = r.sender_name || "Agent";
          const isAi = /ai\s*(bot|assist|assistant)?/i.test(name) || name.toLowerCase().includes("pre-escalation");

          setTimeline((prev) => {
            if (prev.some((existing) => existing.id === r.id)) return prev;
            return [
              ...prev,
              {
                id: r.id,
                kind: "reply" as const,
                speaker: isAi ? ("ai" as const) : ("agent" as const),
                role: "agent" as const,
                senderName: name,
                content: String(r.message || "").replace(/^\[Agent\]\s*/i, ""),
                createdAt: r.created_at,
              },
            ].sort((a, b) => a.createdAt - b.createdAt);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, id]);

  const patchTicket = async (updates: Record<string, unknown>) => {
    if (!session || !ticket) return;
    const res = await workerFetch(`/tickets/${ticket.id}`, {
      method: "PATCH",
      token: session.access_token,
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (res.ok) {
      setTicket(data.ticket);
      toast.success("Ticket updated");
    } else toast.error(data.error || "Update failed");
  };

  if (loading || !ticket) {
    return (
      <div className="max-w-7xl mx-auto space-y-4 p-2">
        <Skeleton className="h-10 w-64" />
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-[520px] lg:col-span-2" />
          <Skeleton className="h-[520px]" />
        </div>
      </div>
    );
  }

  const counts = timeline.reduce(
    (acc, ev) => {
      acc[resolveSpeaker(ev)]++;
      return acc;
    },
    { customer: 0, ai: 0, agent: 0 } as Record<Speaker, number>
  );

  return (
    // Page is height-capped to the viewport so nothing overflows below the fold;
    // only the conversation list and the sidebar scroll internally.
    // Adjust the subtracted value (2rem) to match your shell's real chrome height
    // (top nav / breadcrumb) if this sits inside another layout.
    <div className="max-w-7xl mx-auto h-[calc(100vh-2rem)] max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* Compact header */}
      <div className="flex items-start justify-between gap-4 pb-4 shrink-0">
        <div className="min-w-0 ">
          <Link
            href="/dashboard/tickets"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to tickets
          </Link>
          <h1 className="text-lg font-semibold tracking-tight truncate">{ticket.title}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[ticket.status])} />
              {ticket.status.replace("_", " ").toLowerCase()}
            </span>
            {ticket.urgency === "critical" && (
              <span className="inline-flex items-center gap-1.5 text-red-600 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Critical
              </span>
            )}
            {ticket.category && <span>{ticket.category}</span>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Main: conversation + composer */}
        <Card className="lg:col-span-2 flex flex-col min-h-0 border-0 ring-0 shadow-none">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Conversation</CardTitle>
              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span>Customer · {counts.customer}</span>
                <span className="text-indigo-600 dark:text-indigo-300">AI · {counts.ai}</span>
                <span>Agent · {counts.agent}</span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col min-h-0 pt-0">
            <ScrollArea className="flex-1 min-h-0 pr-3 -mx-1 px-1">
              {timeline.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm space-y-2">
                  <CircleDot className="h-6 w-6 mx-auto opacity-30" />
                  <p>No messages yet.</p>
                  <p className="text-xs max-w-xs mx-auto">
                    Messages from the widget and agent replies will appear here as the conversation happens.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 py-1">
                  {timeline.map((ev, i) => (
                    <ConversationBubble key={ev.id} ev={ev} index={i} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Sidebar: one panel, sectioned with hairlines instead of stacked cards */}
        <Card className="flex flex-col min-h-0 border-l rounded-none ring-0 shadow-none">
          <Tabs defaultValue="details" className="flex flex-col flex-1 min-h-0">
            <div className="p-3 border-b border-border/60 shrink-0">
              <TabsList className="w-full h-8 bg-muted/50">
                <TabsTrigger value="details" className="flex-1 text-xs">Details</TabsTrigger>
                <TabsTrigger value="ai" className="flex-1 text-xs"><Bot className="h-3.5 w-3.5 mr-1.5" /> AI Assistant</TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <TabsContent value="details" className="m-0 border-none outline-none">
                <CardContent className="p-0 divide-y divide-border/60">
            {/* Ticket details */}
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-1">Details</p>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">{ticket.description}</p>
              <div className="divide-y divide-border/40">
                <DetailRow label="Intent" value={ticket.intent || "—"} />
                <DetailRow
                  label="Sentiment"
                  value={ticket.sentiment ? `${SENTIMENT_EMOJI[ticket.sentiment] || ""} ${ticket.sentiment}` : "—"}
                />
                <DetailRow label="Urgency" value={ticket.urgency || "—"} />
                <DetailRow label="Language" value={ticket.language || "en"} />
              </div>

              {ticket.aiSummary && (
                <div className="mt-3 rounded-lg bg-muted/40 border border-border/40 p-3 text-sm">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> AI summary
                  </p>
                  {ticket.aiSummary}
                </div>
              )}
              {ticket.aiSuggestedSolution && (
                <div className="mt-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3 text-sm">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-300 mb-1">
                    Suggested solution
                  </p>
                  {ticket.aiSuggestedSolution}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="p-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Controls</p>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Status</p>
                <Select value={ticket.status} onValueChange={(v) => patchTicket({ status: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Priority</p>
                <Select value={ticket.priority} onValueChange={(v) => patchTicket({ priority: v })}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Resolution code</p>
                <Select
                  value={ticket.resolutionCode || "none"}
                  onValueChange={(v) => patchTicket({ resolutionCode: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {["refund_issued", "info_provided", "bug_fixed", "escalated", "no_action"].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer */}
            <div className="p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Customer</p>
              <p className="text-sm font-medium">{ticket.ownerName || "Unknown"}</p>
              <p className="text-muted-foreground text-xs">{ticket.ownerEmail || "—"}</p>
              {typeof ticket.csat === "number" && (
                <Badge variant="secondary" className="mt-2">
                  CSAT {ticket.csat}/5
                </Badge>
              )}
            </div>

            {/* Similar tickets */}
            <div className="p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Similar tickets</p>
              {similarHint && <p className="text-xs text-muted-foreground">{similarHint}</p>}
              {similar.length === 0 ? (
                <p className="text-sm text-muted-foreground">No similar tickets found.</p>
              ) : (
                similar.map((t) => (
                  <Link
                    key={t.id}
                    href={`/dashboard/tickets/${t.id}`}
                    className="block p-2.5 rounded-lg border border-border/50 hover:bg-muted/40 text-sm transition-colors"
                  >
                    <p className="font-medium truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.status} · {t.category}
                    </p>
                  </Link>
                ))
              )}
            </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="ai" className="m-0 border-none outline-none flex flex-col h-full">
                <AiChatInterface ticket={ticket} onSuggestedReply={() => {}} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
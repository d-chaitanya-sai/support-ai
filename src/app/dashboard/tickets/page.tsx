"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { workerFetch } from "@/lib/worker";
import type { Ticket } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TicketIcon, MessageSquare, Plus, Sparkles, ArrowRight, Filter } from "lucide-react";
import { toast } from "sonner";

const SENTIMENT_EMOJI: Record<string, string> = { happy: "😊", neutral: "😐", angry: "😡" };
const URGENCY_COLOR: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10 border-red-500/20",
  high: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  medium: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  low: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};
const STATUS_COLOR: Record<string, string> = {
  OPEN: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  IN_PROGRESS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  RESOLVED: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  CLOSED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

type UrgencyFilter = "all" | "critical" | "high" | "medium" | "low";

export default function TicketsPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<UrgencyFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    workerFetch("/tickets", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return tickets;
    return tickets.filter((t) => t.urgency === filter);
  }, [tickets, filter]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkUpdate = async (status: string) => {
    if (!session || selected.size === 0) return;
    const res = await workerFetch("/tickets/bulk", {
      method: "POST",
      token: session.access_token,
      body: JSON.stringify({ ids: [...selected], status }),
    });
    if (res.ok) {
      toast.success(`Updated ${selected.size} tickets`);
      setSelected(new Set());
      load();
    } else toast.error("Bulk update failed");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Support Tickets
            <Badge variant="secondary" className="font-semibold text-xs ml-1">{tickets.length}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">
            Manage and respond to customer inquiries.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <AnimatePresence>
            {selected.size > 0 && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }} 
                animate={{ opacity: 1, x: 0 }} 
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2"
              >
                <Button size="sm" variant="outline" onClick={() => bulkUpdate("IN_PROGRESS")} className="h-9">
                  Mark in progress <span className="ml-1.5 bg-muted px-1.5 rounded text-xs">{selected.size}</span>
                </Button>
                <Button size="sm" variant="outline" onClick={() => bulkUpdate("RESOLVED")} className="h-9 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Resolve <span className="ml-1.5 bg-emerald-500/20 px-1.5 rounded text-xs">{selected.size}</span>
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-2 bg-muted/40 p-1 rounded-lg border border-border/50 w-fit">
        <div className="px-2.5 text-muted-foreground flex items-center">
          <Filter className="h-3.5 w-3.5" />
        </div>
        {(["all", "critical", "high", "medium", "low"] as UrgencyFilter[]).map((u) => (
          <button
            key={u}
            onClick={() => setFilter(u)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
              filter === u
                ? "bg-background text-foreground shadow-sm border border-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {/* ── Ticket List ── */}
      <Card className="border-border/50 bg-card/50 overflow-hidden shadow-sm">
        <div className="divide-y divide-border/40">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <Skeleton className="h-4 w-4 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center flex flex-col items-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">No tickets found</p>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-5">
                {filter === "all" 
                  ? "Create a ticket, open your chat widget, or load demo data."
                  : `There are no ${filter} urgency tickets right now.`}
              </p>
              {filter === "all" ? (
                <div className="flex justify-center gap-3">
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted transition-colors gap-1.5"
                  >
                    <Sparkles className="h-4 w-4" /> Load demo
                  </Link>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setFilter("all")}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            filtered.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="flex items-stretch group transition-colors relative hover:bg-muted/40"
              >
                
                <div className="pl-4 pr-3 py-4 flex items-start mt-0.5">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggleSelect(t.id)}
                    className="transition-opacity"
                  />
                </div>
                
                <Link href={`/dashboard/tickets/${t.id}`} className="flex-1 p-4 pl-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
                  <div className="flex-1 min-w-0 flex items-start sm:items-center gap-3">
                    <span className="text-xl shrink-0 mt-0.5 sm:mt-0" title={`Sentiment: ${t.sentiment || "neutral"}`}>
                      {SENTIMENT_EMOJI[t.sentiment || "neutral"]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate text-[15px] transition-colors group-hover:text-primary">
                        {t.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground/80 font-medium bg-muted/50 px-1.5 py-0.5 rounded">
                          {t.category}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(t.createdAt, { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLOR[t.status]}`}>
                      {t.status.replace("_", " ")}
                    </Badge>
                    
                    {t.urgency && (
                      <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${URGENCY_COLOR[t.urgency]}`}>
                        {t.urgency}
                      </Badge>
                    )}
                    
                    <div className="w-5 flex justify-end">
                      <ArrowRight className="h-4 w-4 transition-all text-muted-foreground/40 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-primary" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
 

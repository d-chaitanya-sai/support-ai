"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { workerFetch } from "@/lib/worker";
import type { Ticket } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { TicketIcon, Clock, CheckCircle2, AlertCircle, TrendingUp, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

const SENTIMENT_EMOJI: Record<string, string> = { happy: "😊", neutral: "😐", angry: "😡" };
const URGENCY_COLOR: Record<string, string> = {
  critical: "text-red-500 bg-red-500/10",
  high: "text-orange-500 bg-orange-500/10",
  medium: "text-blue-500 bg-blue-500/10",
  low: "text-slate-400 bg-slate-500/10",
};

export default function DashboardPage() {
  const { session, user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    workerFetch("/tickets", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets || []))
      .finally(() => setLoading(false));
  }, [session]);

  const total = tickets.length;
  const open = tickets.filter((t) => t.status === "OPEN").length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
  const inProgress = tickets.filter((t) => t.status === "IN_PROGRESS").length;
  const critical = tickets.filter((t) => t.urgency === "critical" && t.status === "OPEN").length;
  const angry = tickets.filter((t) => t.sentiment === "angry" && t.status === "OPEN").length;

  const stats = [
    { title: "Total Tickets", value: total, icon: TicketIcon, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20", href: "/dashboard/tickets" },
    { title: "Open", value: open, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", href: "/dashboard/tickets" },
    { title: "In Progress", value: inProgress, icon: TrendingUp, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", href: "/dashboard/tickets" },
    { title: "Resolved", value: resolved, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", href: "/dashboard/tickets" },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] ?? "there";

  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return (
    <div className="space-y-8 mt-12 items-center max-w-7xl mx-auto px-1">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {firstName} 👋
          </h1>
        </div>
        {(angry > 0 || critical > 0) && !loading && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm font-medium shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            {critical > 0 && `${critical} critical`}
            {angry > 0 && critical > 0 && " · "}
            {angry > 0 && `${angry} angry`}
            {" · "}
            <Link href="/dashboard/tickets" className="underline underline-offset-2 hover:opacity-80">Review now</Link>
          </motion.div>
        )}
      </div>

      {/* ── Stat cards ── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, ease: "easeOut" }}>
            <Link href={s.href}>
              <Card className={`relative overflow-hidden border ${s.border} bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group`}>
                <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 blur-2xl -translate-y-6 translate-x-6 ${s.bg}`} />
                <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5 px-5">
                  <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</CardTitle>
                  <div className={`p-2 rounded-lg ${s.bg} border ${s.border}`}>
                    <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {loading
                    ? <Skeleton className="h-9 w-14 mt-1" />
                    : <div className={`text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</div>}
                  <p className="text-xs text-muted-foreground mt-1 group-hover:text-foreground/60 transition-colors">
                    {loading ? "" : `of ${total} total`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* ── Empty state ── */}
      {!loading && tickets.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Card className="border-dashed border-border/60 bg-card/40">
            <CardContent className="py-14 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <TicketIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">No tickets yet</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                  Upload docs, open your chat widget, and escalated conversations will appear here.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-1">
                <Link href="/dashboard/knowledge/documents"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                  Upload docs <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link href="/dashboard/settings"
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                  Load demo data
                </Link>
                {user?.widgetId && (
                  <a href={`/widgets/p/${user.widgetId}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
                    Open widget
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Bottom grid ── */}
      <div className="grid gap-6 lg:grid-cols-5">

        {/* Queue distribution — 2 cols */}
        <Card className="lg:col-span-2 border-border/50 bg-card/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Queue Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {[
              { label: "Open", count: open, color: "bg-amber-500", textColor: "text-amber-600 dark:text-amber-400" },
              { label: "In Progress", count: inProgress, color: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400" },
              { label: "Resolved", count: resolved, color: "bg-emerald-500", textColor: "text-emerald-600 dark:text-emerald-400" },
            ].map(({ label, count, color, textColor }) => (
              <div key={label} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">{label}</span>
                  <span className={`font-semibold ${textColor}`}>{loading ? "—" : count}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full ${color} rounded-full`}
                    initial={{ width: 0 }}
                    animate={{ width: !loading && total > 0 ? `${(count / total) * 100}%` : "0%" }}
                    transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                  />
                </div>
              </div>
            ))}

            {/* Resolution rate */}
            <div className="pt-2 border-t border-border/50 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Resolution rate</p>
                {loading
                  ? <Skeleton className="h-6 w-12 mt-1" />
                  : <p className="text-xl font-bold text-emerald-500">{resolutionRate}%</p>}
              </div>
              <div className="relative h-12 w-12">
                <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                  <circle cx="18" cy="18" r="14" fill="none" className="stroke-muted" strokeWidth="3" />
                  <motion.circle
                    cx="18" cy="18" r="14" fill="none"
                    className="stroke-emerald-500"
                    strokeWidth="3" strokeLinecap="round"
                    strokeDasharray="87.96"
                    initial={{ strokeDashoffset: 87.96 }}
                    animate={{ strokeDashoffset: loading ? 87.96 : 87.96 * (1 - resolutionRate / 100) }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                  />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent tickets — 3 cols */}
        <Card className="lg:col-span-3 border-border/50 bg-card/50 flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Recent Tickets</CardTitle>
            <Link href="/dashboard/tickets"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="flex-1 space-y-1 px-4 pb-4">
            {loading
              ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)
              : tickets.length === 0
                ? <p className="text-sm text-muted-foreground text-center py-8">No tickets yet</p>
                : tickets.slice(0, 4).map((t, i) => (
                  <motion.div key={t.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link href={`/dashboard/tickets/${t.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors border border-transparent hover:border-border/60 group">
                      <span className="text-lg shrink-0">{SENTIMENT_EMOJI[t.sentiment || "neutral"] ?? "😐"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(t.createdAt, { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.urgency && (
                          <Badge variant="secondary" className={`text-[10px] font-semibold px-2 py-0.5 ${URGENCY_COLOR[t.urgency]}`}>
                            {t.urgency}
                          </Badge>
                        )}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                      </div>
                    </Link>
                  </motion.div>
                ))
            }
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

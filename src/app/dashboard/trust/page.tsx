"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { workerFetch } from "@/lib/worker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Shield, Lock, ShieldAlert, UserCheck, Clock3 } from "lucide-react";

interface AuditRow {
  id: string;
  ticketId: string | null;
  ticketTitle?: string;
  action: string;
  actorName: string | null;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

// Dot color mirrors the ticket-detail speaker system: indigo = AI action.
const ACTION_META: Record<string, { label: string; dot: string }> = {
  "ticket.created": { label: "Ticket created", dot: "bg-zinc-400" },
  "ai.suggest_reply": { label: "AI drafted a reply", dot: "bg-indigo-500" },
  "ai.reply_sent": { label: "AI-assisted reply sent", dot: "bg-indigo-500" },
};

export default function AuditPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    workerFetch("/audit?limit=50", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setRows(d.logs || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-500" /> Trust & audit
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          PII redaction and jailbreak shields run on the widget. AI actions are logged server-side.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { title: "PII redaction", desc: "Emails, phones, and cards masked before LLM calls.", icon: Lock, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
          { title: "Prompt injection shield", desc: "Jailbreak-like inputs get a safe refusal.", icon: ShieldAlert, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
          { title: "Human gate", desc: "Critical/angry tickets: use Suggest reply, then Send.", icon: UserCheck, color: "text-sky-500", bg: "bg-sky-500/10", border: "border-sky-500/20" },
        ].map((c, i) => (
          <motion.div key={c.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border-border/50 bg-card/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <CardHeader className="pb-2">
                <div className={`inline-flex p-2 rounded-lg ${c.bg} border ${c.border} mb-2 w-fit`}>
                  <c.icon className={`h-4 w-4 ${c.color}`} />
                </div>
                <CardTitle className="text-sm font-semibold">{c.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{c.desc}</CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">AI audit log</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Every AI action taken on a ticket, in order.</p>
          </div>
          {!loading && rows.length > 0 && (
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right">
                <div className="text-lg font-bold text-indigo-500 leading-none">{rows.length}</div>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Logged</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold leading-none flex items-center gap-1 justify-end">
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatDistanceToNow(rows[0].createdAt, { addSuffix: false })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">Since last action</p>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border/40">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted/50 animate-pulse rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">No AI actions logged yet — they'll appear as the widget and agent AI tools get used.</p>
          ) : (
            rows.map((r) => {
              const meta = ACTION_META[r.action] || { label: r.action, dot: "bg-zinc-400" };
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
                    <span className="font-medium shrink-0">{meta.label}</span>
                    <span className="text-muted-foreground truncate">
                      {r.actorName || "system"}{r.ticketTitle ? ` · ${r.ticketTitle}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(r.createdAt, { addSuffix: true })}
                    </span>
                    {r.ticketId && (
                      <Link href={`/dashboard/tickets/${r.ticketId}`} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
                        Open
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

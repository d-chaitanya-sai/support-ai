"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { workerFetch } from "@/lib/worker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { motion } from "framer-motion";
import { BarChart3, Globe, Heart, Target, Zap } from "lucide-react";

interface AnalyticsData {
  deflectionRate: number;
  kbCoverage: number;
  avgCsat: number | null;
  openTickets: number;
  resolved: number;
  totalTickets: number;
  sentimentTrend: { happy: number; neutral: number; angry: number };
  byLanguage: Record<string, number>;
  topics: Record<string, number>;
  gapQueries: Array<{ query: string; createdAt: number }>;
  avgSearchLatencyMs: number;
  searchesAnalyzed: number;
  aiAssistMessages: number;
  agentAiAdoptionScore: number;
  estimatedCostPerResolution: string;
}

export default function AnalyticsPage() {
  const { session } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    workerFetch("/analytics", { token: session.access_token })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [session]);

  if (loading || !data) {
    return (
      <div className="max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const topicMax = Math.max(...Object.values(data.topics), 1);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-500" /> Analytics
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">How your AI support is performing.</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Deflection rate", value: `${data.deflectionRate}%`, icon: Target, hint: "KB-answered searches", color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
          { title: "KB coverage", value: `${data.kbCoverage}%`, icon: Zap, hint: "Non-zero retrievals", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
          { title: "Avg CSAT", value: data.avgCsat != null ? `${data.avgCsat}/5` : "—", icon: Heart, hint: "From widget ratings", color: "text-rose-500", bg: "bg-rose-500/10", border: "border-rose-500/20" },
          { title: "AI adoption", value: `${data.agentAiAdoptionScore}`, icon: Globe, hint: "Assist usage score", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
        ].map((s, i) => (
          <motion.div key={s.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className={`relative overflow-hidden border ${s.border} bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-5 blur-2xl -translate-y-6 translate-x-6 ${s.bg}`} />
              <CardHeader className="pb-2 flex flex-row items-center justify-between pt-5 px-5">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.title}</CardTitle>
                <div className={`p-2 rounded-lg ${s.bg} border ${s.border}`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className={`text-3xl font-bold tracking-tight ${s.color}`}>{s.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{s.hint}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Sentiment trend</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(data.sentimentTrend).map(([k, v]) => (
              <div key={k} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium capitalize">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
                <Progress value={data.totalTickets ? (v / data.totalTickets) * 100 : 0} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Topic heatmap</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(data.topics).length === 0 ? (
              <p className="text-sm text-muted-foreground">No ticket categories yet.</p>
            ) : (
              Object.entries(data.topics).map(([k, v]) => (
                <div key={k} className="space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">{k}</span>
                    <span className="font-semibold">{v}</span>
                  </div>
                  <Progress value={(v / topicMax) * 100} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Language cohorts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(data.byLanguage).map(([lang, count]) => (
              <Badge key={lang} variant="secondary" className="font-medium">
                {lang} <span className="text-muted-foreground ml-1">{count}</span>
              </Badge>
            ))}
            {Object.keys(data.byLanguage).length === 0 && (
              <p className="text-sm text-muted-foreground">No language data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Ops snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs font-medium">Open</p>
              <p className="text-xl font-bold mt-0.5">{data.openTickets}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Resolved</p>
              <p className="text-xl font-bold mt-0.5 text-emerald-500">{data.resolved}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Avg search latency</p>
              <p className="text-xl font-bold mt-0.5">{data.avgSearchLatencyMs}ms</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">Est. cost / resolve</p>
              <p className="text-xl font-bold mt-0.5">{data.estimatedCostPerResolution}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

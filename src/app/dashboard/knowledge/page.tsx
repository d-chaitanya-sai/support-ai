"use client";

import { useEffect, useState } from "react";
import { workerFetch } from "@/lib/worker";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  FileText, Globe, HelpCircle,
  Upload, Plus, TrendingUp, Zap, Database
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface KnowledgeStats {
  totalDocuments: number;
  readyDocuments: number;
  totalChunks: number;
  totalEmbeddings: number;
  totalFaqs: number;
  webPages: number;
  searchesToday: number;
  avgSearchLatencyMs: number;
}

export default function KnowledgeOverviewPage() {
  const { session } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    workerFetch("/knowledge/stats", { token: session.access_token })
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [session]);

  const statCards = stats
    ? [
        { label: "Total Documents", value: stats.totalDocuments, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20" },
        { label: "Chunks", value: stats.totalChunks.toLocaleString(), icon: Database, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
        { label: "Embeddings", value: stats.totalEmbeddings.toLocaleString(), icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
        { label: "Web Pages", value: stats.webPages, icon: Globe, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
        { label: "FAQs", value: stats.totalFaqs, icon: HelpCircle, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
        { label: "Searches Today", value: stats.searchesToday, icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
        { label: "Avg Latency", value: `${stats.avgSearchLatencyMs}ms`, icon: TrendingUp, color: "text-indigo-500", bg: "bg-indigo-500/10", border: "border-indigo-500/20" },
        { label: "Ready Docs", value: stats.readyDocuments, icon: FileText, color: "text-teal-500", bg: "bg-teal-500/10", border: "border-teal-500/20" },
      ]
    : [];

  const quickActions = [
    { label: "Upload Document", icon: Upload, href: "/dashboard/knowledge/documents", color: "bg-blue-500" },
    { label: "Crawl Website", icon: Globe, href: "/dashboard/knowledge/crawler", color: "bg-cyan-500" },
    { label: "Add FAQ", icon: Plus, href: "/dashboard/knowledge/faqs", color: "bg-green-500" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your RAG-powered company knowledge platform</p>
        </div>
        <Button size="sm" onClick={() => router.push("/dashboard/knowledge/documents")}>
          <Upload className="h-4 w-4 mr-2" />
          Upload
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : statCards.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className={`relative overflow-hidden border ${s.border} bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200`}>
                  <div className={`absolute top-0 right-0 w-20 h-20 rounded-full opacity-5 blur-2xl -translate-y-6 translate-x-6 ${s.bg}`} />
                  <CardContent className="p-4">
                    <div className={`inline-flex p-2 rounded-lg ${s.bg} border ${s.border} mb-3`}>
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                    <div className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickActions.map((action) => (
              <Link key={action.label} href={action.href}>
                <div className="group flex flex-col items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 hover:shadow-sm transition-all cursor-pointer">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${action.color}/15`}
                  >
                    <action.icon className={`h-5 w-5 text-foreground`} />
                  </div>
                  <span className="text-sm font-medium text-center">{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

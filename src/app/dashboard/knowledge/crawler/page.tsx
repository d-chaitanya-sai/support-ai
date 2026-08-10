"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Globe, Loader2, CheckCircle2, ChevronRight } from "lucide-react";

interface CrawlJob {
  id: string;
  url: string;
  status: "completed" | "failed";
  pages_found: number;
  pages_processed: number;
  created_at: number;
  error?: string;
}

const PIPELINE_STEPS = [
  "Fetch pages",
  "Extract content",
  "Chunk text",
  "Generate embeddings",
  "Store in Supabase",
];

export default function CrawlerPage() {
  const { session } = useAuth();
  const [url, setUrl] = useState("");
  const [maxDepth, setMaxDepth] = useState(2);
  const [ignoreBlog, setIgnoreBlog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const handleCrawl = async () => {
    if (!url.trim() || !session) return;
    setLoading(true);
    setActiveStep(0);

    // Advance through the fetch/extract/chunk steps while the request is in flight —
    // it holds on the last step until the real response arrives rather than
    // pre-declaring completion before any work has happened.
    let step = 0;
    const stepTimer = setInterval(() => {
      step = Math.min(step + 1, PIPELINE_STEPS.length - 2);
      setActiveStep(step);
    }, 700);

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          url,
          options: { maxDepth, ignoreBlog, autoRefreshWeekly: autoRefresh },
        }),
      });
      const data = await res.json();
      clearInterval(stepTimer);

      if (res.ok && data.document) {
        setActiveStep(PIPELINE_STEPS.length); // all steps complete
        setJobs((prev) => [{
          id: data.document.id,
          url,
          status: "completed",
          pages_found: data.pagesFound ?? 1,
          pages_processed: data.pagesProcessed ?? 1,
          created_at: Date.now(),
        }, ...prev]);
        toast.success(
          `Indexed ${data.pagesProcessed ?? 1} page${(data.pagesProcessed ?? 1) === 1 ? "" : "s"} — document is ready in Documents.`
        );
        setUrl("");
      } else {
        setJobs((prev) => [{
          id: `failed-${Date.now()}`,
          url,
          status: "failed",
          pages_found: 0,
          pages_processed: 0,
          created_at: Date.now(),
          error: data.error,
        }, ...prev]);
        toast.error(data.error || "Crawl failed");
      }
    } catch {
      clearInterval(stepTimer);
      setJobs((prev) => [{
        id: `failed-${Date.now()}`,
        url,
        status: "failed",
        pages_found: 0,
        pages_processed: 0,
        created_at: Date.now(),
        error: "Network error",
      }, ...prev]);
      toast.error("Crawl failed — network error");
    } finally {
      setLoading(false);
      setTimeout(() => setActiveStep(null), 600);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Website Crawler</h2>
        <p className="text-muted-foreground text-sm mt-1">Import any website into your knowledge base automatically</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input form */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader><CardTitle className="text-sm font-semibold">Crawl Website</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input
                placeholder="https://company.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-background"
              />
            </div>

            <div className="space-y-3">
              <Label>Crawl depth</Label>
              <div className="flex gap-2">
                {[
                  { depth: 1, label: "This page only" },
                  { depth: 2, label: "Up to 5 pages" },
                  { depth: 3, label: "Up to 10 pages" },
                ].map((opt) => (
                  <button
                    key={opt.depth}
                    type="button"
                    onClick={() => setMaxDepth(opt.depth)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      maxDepth === opt.depth
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={ignoreBlog}
                  onChange={() => setIgnoreBlog((v) => !v)}
                  className="rounded"
                />
                <span className="text-sm">Skip /blog pages</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={() => setAutoRefresh((v) => !v)}
                  className="rounded"
                />
                <span className="text-sm">Auto refresh weekly</span>
              </label>
            </div>

            <Button onClick={handleCrawl} disabled={loading || !url.trim()} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
              Start Crawl
            </Button>
          </CardContent>
        </Card>

        {/* Pipeline visualization */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader><CardTitle className="text-sm font-semibold">Processing Pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    activeStep === null ? "bg-muted text-muted-foreground"
                    : i < (activeStep ?? -1) ? "bg-green-500/10 text-green-600"
                    : i === activeStep ? "bg-primary text-primary-foreground animate-pulse"
                    : "bg-muted text-muted-foreground"
                  }`}>
                    {activeStep !== null && i < activeStep ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`text-sm transition-all ${i === activeStep ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                      {step}
                    </span>
                    {i === activeStep && <div className="h-1 flex-1 bg-primary/20 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full animate-progress" />
                    </div>}
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job history */}
      {jobs.length > 0 && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader><CardTitle className="text-sm font-semibold">Recent Crawls</CardTitle></CardHeader>
          <CardContent className="p-0 divide-y divide-border/50">
            <AnimatePresence>
              {jobs.map((job) => (
                <motion.div key={job.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 px-4 py-3">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm truncate block">{job.url}</span>
                    {job.status === "completed" ? (
                      <span className="text-xs text-muted-foreground">
                        {job.pages_processed} of {job.pages_found} page{job.pages_found === 1 ? "" : "s"} indexed
                      </span>
                    ) : job.error ? (
                      <span className="text-xs text-red-500 truncate block">{job.error}</span>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                    <span className={cn("h-1.5 w-1.5 rounded-full", job.status === "completed" ? "bg-emerald-500" : "bg-red-500")} />
                    {job.status}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { workerFetch } from "@/lib/worker";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { KnowledgeFaq } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";

export default function FaqsPage() {
  const { session } = useAuth();
  const [faqs, setFaqs] = useState<KnowledgeFaq[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");
  const [priority, setPriority] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchFaqs = () => {
    if (!session) return;
    workerFetch("/knowledge/faqs", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchFaqs(); }, [session]);

  const handleAdd = async () => {
    if (!question.trim() || !answer.trim() || !session) return;
    const res = await workerFetch("/knowledge/faqs", {
      method: "POST",
      token: session.access_token,
      body: JSON.stringify({
        question,
        answer,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        priority,
      }),
    });
    const data = await res.json();
    if (data.faq) {
      setFaqs((prev) => [data.faq, ...prev]);
      setQuestion(""); setAnswer(""); setTags(""); setPriority(1);
      toast.success("FAQ added!");
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    await workerFetch(`/knowledge/faqs/${id}`, { method: "DELETE", token: session.access_token });
    setFaqs((prev) => prev.filter((f) => f.id !== id));
    toast.success("FAQ deleted");
  };

  const handleGenerate = async () => {
    if (!session) return;
    setGenerating(true);
    try {
      const res = await workerFetch("/knowledge/faqs/generate", {
        method: "POST",
        token: session.access_token,
        body: JSON.stringify({ count: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      if (data.faqs?.length) {
        toast.success(`AI generated ${data.faqs.length} FAQs from your knowledge base`);
        fetchFaqs(); // backend already persisted them — just reload the true list
      } else {
        toast.message("No FAQs generated — try adding more documents first");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">FAQ Manager</h2>
          <p className="text-muted-foreground text-sm mt-1">AI uses FAQs before searching documents — highest priority answers</p>
        </div>
        <Button variant="outline" onClick={handleGenerate} disabled={generating} className="gap-2">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-indigo-500" />}
          AI Generate FAQs
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Add FAQ form */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" />Add FAQ</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Question</Label>
              <Input placeholder="How do I reset my password?" value={question} onChange={(e) => setQuestion(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea placeholder="To reset your password, go to..." value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-[80px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input placeholder="password, auth, login" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Priority (1-5)</Label>
                <Input type="number" min={1} max={5} value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <Button onClick={handleAdd} disabled={!question.trim() || !answer.trim()} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Add FAQ
            </Button>
          </CardContent>
        </Card>

        {/* FAQ list */}
        <div className="space-y-3">
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-xl" />)
          ) : faqs.length === 0 ? (
            <Card className="border-border/50 bg-card/50">
              <CardContent className="flex flex-col items-center py-12 gap-3 text-muted-foreground">
                <p>No FAQs yet</p>
                <Button variant="outline" size="sm" onClick={handleGenerate}>AI Generate FAQs</Button>
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence>
              {faqs.map((faq) => (
                <motion.div key={faq.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="rounded-xl border border-border bg-card/50 overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Badge variant="secondary" className="shrink-0 text-xs">P{faq.priority}</Badge>
                      <span className="text-sm font-medium truncate">{faq.question}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {faq.tags?.slice(0, 2).map((t) => (
                        <span key={t} className="hidden sm:block text-xs px-1.5 py-0.5 bg-muted rounded">{t}</span>
                      ))}
                      {expandedId === faq.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>
                  <AnimatePresence>
                    {expandedId === faq.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                          <p className="text-sm text-muted-foreground">{faq.answer}</p>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(faq.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

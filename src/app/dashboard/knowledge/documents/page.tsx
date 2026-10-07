"use client";

import { useEffect, useState, useRef } from "react";
import { workerFetch } from "@/lib/worker";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { KnowledgeDocument } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, Trash2, Eye,
  Search, Loader2
} from "lucide-react";

// Neutral, low-noise status system: a dot + label instead of a filled chip.
const STATUS_CONFIG = {
  ready: { label: "Ready", dot: "bg-emerald-500" },
  embedding: { label: "Embedding", dot: "bg-indigo-500" },
  chunking: { label: "Chunking", dot: "bg-amber-500" },
  uploading: { label: "Uploading", dot: "bg-indigo-500" },
  failed: { label: "Failed", dot: "bg-red-500" },
};

const TYPE_ICON: Record<string, string> = {
  pdf: "📄", docx: "📝", txt: "📃", markdown: "🔣", html: "🌐", csv: "📊", url: "🔗", faq: "❓",
};

export default function DocumentsPage() {
  const { session } = useAuth();
  const [docs, setDocs] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = () => {
    if (!session) return;
    setLoading(true);
    workerFetch("/knowledge/documents", { token: session.access_token })
      .then((r) => r.json())
      .then((d) => setDocs(d.documents || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDocs(); }, [session]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploading(true);
    try {
      let text = "";
      const ext = file.name.split(".").pop()?.toLowerCase() || "txt";
      const typeMap: Record<string, string> = { pdf: "pdf", docx: "docx", txt: "txt", md: "markdown", html: "html", csv: "csv" };
      
      toast.info("Extracting text from document...", { id: "uploading" });
      
      const formData = new FormData();
      formData.append("file", file);
      
      const parseRes = await fetch("/api/parse-document", {
        method: "POST",
        body: formData,
      });
      
      if (!parseRes.ok) {
        const errorData = await parseRes.json();
        throw new Error(errorData.error || "Failed to parse document");
      }
      
      const parseData = await parseRes.json();
      text = parseData.text;

      toast.info("Chunking and generating embeddings...", { id: "uploading" });
      
      const { chunkText } = await import("@/lib/chunk");
      const textChunks = chunkText(text, 500, 50);
      
      const chunks = [];
      for (const chunk of textChunks) {
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: chunk }),
        });
        const data = await res.json();
        
        chunks.push({
          content: chunk,
          embedding: data.embedding,
          tokenCount: Math.ceil(chunk.length / 4),
        });
      }

      await workerFetch("/knowledge/documents", {
        method: "POST",
        token: session.access_token,
        body: JSON.stringify({ 
          title: file.name, 
          content: text, 
          type: typeMap[ext] || "txt",
          chunks
        }),
      });
      toast.success("Document uploaded and processed!", { id: "uploading" });
      fetchDocs();
    } catch {
      toast.error("Upload failed", { id: "uploading" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!session || !confirm("Delete this document and all its chunks?")) return;
    await workerFetch(`/knowledge/documents/${id}`, { method: "DELETE", token: session.access_token });
    toast.success("Document deleted");
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()) ||
    d.type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Documents</h2>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search documents..." className="pl-9 bg-card w-56" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.html,.csv" className="hidden" onChange={handleFileUpload} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </div>
      </div>

      {/* Supported formats & notices */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {["DOCX", "TXT", "Markdown", "HTML", "CSV"].map((f) => (
            <span key={f} className="text-xs px-2 py-1 bg-muted rounded-md text-muted-foreground font-medium">{f}</span>
          ))}
        </div>
        <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-md font-medium">
          ⚠️ PDF not yet available (coming soon)
        </span>
      </div>

      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/50 animate-pulse rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <FileText className="h-12 w-12 opacity-30" />
              <p className="font-medium">No documents yet</p>
              <p className="text-sm">Upload DOCX, TXT, Markdown, HTML, or CSV files</p>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>Upload first document</Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((doc) => {
                const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.ready;
                return (
                  <motion.div key={doc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                    <div className="text-2xl">{TYPE_ICON[doc.type] || "📄"}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusCfg.dot, doc.status === "uploading" && "animate-pulse")} />
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{doc.chunkCount} chunks</span>
                        <span>{doc.embeddingCount} embeddings</span>
                        {doc.aiTags?.slice(0, 3).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 bg-muted rounded text-xs">{t}</span>
                        ))}
                      </div>
                      {doc.aiSummary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{doc.aiSummary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDoc(doc)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document detail panel */}
      <AnimatePresence>
        {selectedDoc && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">{selectedDoc.title}</h3>
                    <p className="text-xs text-muted-foreground">{selectedDoc.type} · {selectedDoc.chunkCount} chunks · {selectedDoc.embeddingCount} embeddings</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedDoc(null)}>Close</Button>
                </div>
                {selectedDoc.aiSummary && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">AI Summary</p>
                    <p className="text-sm">{selectedDoc.aiSummary}</p>
                  </div>
                )}
                {selectedDoc.aiTags && selectedDoc.aiTags.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Auto Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedDoc.aiTags.map((t) => (
                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

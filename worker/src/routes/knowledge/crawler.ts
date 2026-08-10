import { Hono } from "hono";
import type { Env } from "../../index";
import { getSupabase } from "../../lib/supabase";

type Variables = { userId: string };
const crawler = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /knowledge/crawl - save crawled data
crawler.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    url: string;
    title: string;
    content: string;
    collectionId?: string;
    options?: any;
    chunks: Array<{
      content: string;
      embedding: number[];
      tokenCount: number;
    }>;
    pagesFound?: number;
    pagesProcessed?: number;
  }>();

  if (!body.url) return c.json({ error: "URL required" }, 400);
  if (!body.chunks?.length) return c.json({ error: "No content chunks to index" }, 400);

  const now = Date.now();
  const pagesFound = body.pagesFound ?? 1;
  const pagesProcessed = body.pagesProcessed ?? 1;

  // 1. Create completed crawl job
  const { data: job, error: jobErr } = await supabase
    .from("crawl_jobs")
    .insert({
      url: body.url,
      collection_id: body.collectionId || null,
      status: "completed",
      pages_found: pagesFound,
      pages_processed: pagesProcessed,
      options: body.options || {},
      user_id: c.get("userId"),
      started_at: now,
      completed_at: now,
      created_at: now,
    })
    .select()
    .single();

  if (jobErr || !job) return c.json({ error: jobErr?.message || "Failed to create job" }, 500);

  // 2. Create document
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      title: body.title,
      type: "url",
      collection_id: body.collectionId || null,
      source_url: body.url,
      status: "ready",
      chunk_count: body.chunks.length,
      embedding_count: body.chunks.length,
      token_count: body.chunks.reduce((acc, ch) => acc + ch.tokenCount, 0),
      metadata: { job_id: job.id },
      user_id: c.get("userId"),
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (docErr || !doc) return c.json({ error: docErr?.message || "Insert failed" }, 500);

  // 3. Insert chunks
  const chunkInserts = body.chunks.map((chunk, i) => ({
    document_id: doc.id,
    chunk_index: i,
    content: chunk.content,
    token_count: chunk.tokenCount,
    embedding: chunk.embedding,
    metadata: { source_url: body.url },
    user_id: c.get("userId"),
  }));

  const { error: chunkErr } = await supabase.from("knowledge_chunks").insert(chunkInserts);
  if (chunkErr) {
    await supabase.from("knowledge_documents").update({ status: "failed" }).eq("id", doc.id);
    return c.json({ error: "Failed to insert chunks", details: chunkErr.message }, 500);
  }

  return c.json({ document: doc, job: job, pagesFound, pagesProcessed }, 201);
});

export default crawler;

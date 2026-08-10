import { Hono } from "hono";
import type { Env } from "../../index";
import { getSupabase } from "../../lib/supabase";
import { getGroq, MODEL } from "../../lib/groq";

type Variables = { userId: string };
const docs = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /knowledge/documents
docs.get("/", async (c) => {
  const supabase = getSupabase(c.env);
  const collectionId = c.req.query("collectionId");

  let q = supabase
    .from("knowledge_documents")
    .select(`*, knowledge_collections(name, color, icon)`)
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false });

  if (collectionId) q = q.eq("collection_id", collectionId);

  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);

  return c.json({
    documents: (data || []).map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type,
      collectionId: d.collection_id,
      collectionName: d.knowledge_collections?.name,
      sourceUrl: d.source_url,
      status: d.status,
      chunkCount: d.chunk_count || 0,
      embeddingCount: d.embedding_count || 0,
      tokenCount: d.token_count,
      aiSummary: d.ai_summary,
      aiTags: d.ai_tags,
      metadata: d.metadata,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
});

// POST /knowledge/documents - upload with pre-embedded chunks
docs.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    title: string;
    content: string; // Used for summary generation
    type: string;
    collectionId?: string;
    sourceUrl?: string;
    metadata?: Record<string, string>;
    chunks: Array<{
      content: string;
      embedding: number[];
      tokenCount: number;
    }>;
  }>();

  const now = Date.now();

  // 1. Insert document record
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      title: body.title,
      type: body.type || "txt",
      collection_id: body.collectionId || null,
      source_url: body.sourceUrl || null,
      status: "embedding",
      chunk_count: body.chunks.length,
      embedding_count: body.chunks.length,
      metadata: body.metadata || {},
      user_id: c.get("userId"),
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (docErr || !doc) return c.json({ error: docErr?.message || "Insert failed" }, 500);

  try {
    // 2. Insert pre-embedded chunks
    const chunkInserts = body.chunks.map((chunk, i) => ({
      document_id: doc.id,
      chunk_index: i,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: chunk.embedding,
      metadata: {},
      user_id: c.get("userId"),
    }));

    const { error: chunkErr } = await supabase.from("knowledge_chunks").insert(chunkInserts);
    if (chunkErr) throw new Error(`Chunk insert failed: ${chunkErr.message}`);

    // 3. Generate AI summary + tags using Groq
    let aiSummary = "";
    let aiTags: string[] = [];
    try {
      const groq = getGroq(c.env);
      const summaryRes = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `Analyze this document and return JSON: {"summary": "2-3 sentence summary", "tags": ["tag1","tag2","tag3","tag4","tag5"], "keywords": ["kw1","kw2","kw3"]}. Only JSON, no other text.`,
          },
          { role: "user", content: body.content.slice(0, 3000) },
        ],
        max_tokens: 200,
        temperature: 0.3,
      });
      const raw = summaryRes.choices[0]?.message?.content || "{}";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        aiSummary = parsed.summary || "";
        aiTags = parsed.tags || [];
      }
    } catch {}

    // 4. Mark as ready
    await supabase.from("knowledge_documents").update({
      status: "ready",
      ai_summary: aiSummary,
      ai_tags: aiTags,
      token_count: body.chunks.reduce((acc, ch) => acc + ch.tokenCount, 0),
      updated_at: Date.now(),
    }).eq("id", doc.id);

    return c.json({ document: { id: doc.id, status: "ready", chunkCount: body.chunks.length } }, 201);
  } catch (e) {
    await supabase.from("knowledge_documents").update({ status: "failed" }).eq("id", doc.id);
    return c.json({ error: "Processing failed", details: String(e) }, 500);
  }
});

// DELETE /knowledge/documents/:id
docs.delete("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const id = c.req.param("id");
  const { data: doc } = await supabase.from("knowledge_documents").select("user_id").eq("id", id).single();
  if (doc?.user_id !== c.get("userId")) return c.json({ error: "Not found" }, 404);

  await supabase.from("knowledge_chunks").delete().eq("document_id", id);
  const { error } = await supabase.from("knowledge_documents").delete().eq("id", id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// POST /knowledge/documents/:id/re-embed
docs.post("/:id/re-embed", async (c) => {
  return c.json({ error: "Re-embedding is not supported on the server. Please re-upload the document from the dashboard to generate new client-side embeddings." }, 501);
});

// GET /knowledge/documents/:id
docs.get("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("*")
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("userId"))
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json({ document: data });
});

// GET /knowledge/documents/:id/chunks
docs.get("/:id/chunks", async (c) => {
  const supabase = getSupabase(c.env);
  const id = c.req.param("id");
  const { data: doc } = await supabase.from("knowledge_documents").select("user_id").eq("id", id).single();
  if (doc?.user_id !== c.get("userId")) return c.json({ error: "Not found" }, 404);

  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("id, chunk_index, content, token_count")
    .eq("document_id", id)
    .order("chunk_index");

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ chunks: data || [] });
});

export default docs;

import { Hono } from "hono";
import type { Env } from "../../index";
import { getSupabase } from "../../lib/supabase";
import { buildRagContext } from "../../lib/ai-utils";
import { getGroq, MODEL } from "../../lib/groq";

type Variables = { userId: string };
const search = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /knowledge/search - semantic search (playground)
search.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const start = Date.now();
  const body = await c.req.json<{
    query: string;
    query_embedding?: number[];
    topK?: number;
    threshold?: number;
    collectionIds?: string[];
    generateAnswer?: boolean;
  }>();

  const { query, query_embedding: embedding, topK = 10, threshold = 0.3, generateAnswer = false } = body;
  if (!query) return c.json({ error: "query required" }, 400);
  if (!embedding) return c.json({ error: "query_embedding required" }, 400);

  // 1. Embed query (already done by client)
  const embedTime = 0;

  const { data: chunks, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_count: 50,
    similarity_threshold: threshold,
  });

  if (error) return c.json({ error: error.message }, 500);

  const { data: allowedChunks } = await supabase
    .from("knowledge_chunks")
    .select("id")
    .eq("user_id", c.get("userId"))
    .in("id", (chunks || []).map((c: any) => c.id));
    
  const allowedSet = new Set((allowedChunks || []).map(c => c.id));
  const filteredChunks = (chunks || []).filter((c: any) => allowedSet.has(c.id)).slice(0, topK);

  const results = filteredChunks.map((ch: Record<string, unknown>) => ({
    id: ch.id,
    chunkIndex: ch.chunk_index,
    content: ch.content,
    similarity: parseFloat(((ch.similarity as number) * 100).toFixed(2)),
    tokenCount: ch.token_count,
    documentId: ch.document_id,
    documentTitle: ch.document_title || "Unknown",
    documentType: ch.document_type,
  }));

  let answer = "";
  let finalPrompt = "";
  let tokensUsed = 0;

  if (generateAnswer && results.length > 0) {
    const context = buildRagContext(
      results.slice(0, 5).map((r: Record<string, unknown>) => ({
        content: r.content as string,
        similarity: (r.similarity as number) / 100,
        documentTitle: r.documentTitle as string,
      }))
    );

    finalPrompt = `You are a helpful assistant. Answer the question using ONLY the provided context. If the context doesn't contain the answer, say "I don't have information about that in the knowledge base."

Context:
${context}

Question: ${query}`;

    const groq = getGroq(c.env);
    const res = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: finalPrompt }],
      max_tokens: 500,
      temperature: 0.3,
    });
    answer = res.choices[0]?.message?.content || "";
    tokensUsed = res.usage?.total_tokens || 0;
  }

  const totalTime = Date.now() - start;

  // Log the search
  try {
    await supabase.from("knowledge_search_logs").insert({
      query,
      retrieved_chunks: results.length,
      response_time: totalTime,
      tokens: tokensUsed,
      user_id: c.get("userId"),
      created_at: Date.now(),
    });
  } catch {}

  // Confidence score
  const avgSimilarity = results.length
    ? results.reduce((s: number, r: Record<string, unknown>) => s + (r.similarity as number), 0) / results.length
    : 0;
  const confidence = results.length >= 3 && avgSimilarity >= 70 ? "high"
    : results.length >= 1 && avgSimilarity >= 50 ? "medium"
    : "low";

  return c.json({
    results,
    answer,
    finalPrompt: generateAnswer ? finalPrompt : undefined,
    stats: {
      totalResults: results.length,
      embedTimeMs: embedTime,
      totalTimeMs: totalTime,
      tokensUsed,
      avgSimilarity: parseFloat(avgSimilarity.toFixed(1)),
      confidence,
      confidenceLabel: confidence === "high" ? `${Math.round(avgSimilarity)}% — Supported by ${results.length} chunks`
        : confidence === "medium" ? `${Math.round(avgSimilarity)}% — Limited context`
        : "Insufficient context",
    },
  });
});

// GET /knowledge/search/logs - search analytics
search.get("/logs", async (c) => {
  const supabase = getSupabase(c.env);
  const limit = parseInt(c.req.query("limit") || "50");
  const { data, error } = await supabase
    .from("knowledge_search_logs")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return c.json({ error: error.message }, 500);

  // Gap analysis: queries with 0 retrieved chunks
  const gaps = (data || [])
    .filter((l: Record<string, unknown>) => (l.retrieved_chunks as number) === 0)
    .map((l: Record<string, unknown>) => ({ query: l.query, createdAt: l.created_at }));

  return c.json({ logs: data || [], gaps });
});

export default search;

import { Hono } from "hono";
import type { Env } from "../../index";
import { getSupabase } from "../../lib/supabase";
import { getGemini, MODEL } from "../../lib/gemini";

type Variables = { userId: string };
const faqs = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /knowledge/faqs
faqs.get("/", async (c) => {
  const supabase = getSupabase(c.env);
  const collectionId = c.req.query("collectionId");
  let q = supabase
    .from("knowledge_faqs")
    .select("*")
    .eq("user_id", c.get("userId"))
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (collectionId) q = q.eq("collection_id", collectionId);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ faqs: data || [] });
});

// POST /knowledge/faqs
faqs.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("knowledge_faqs")
    .insert({
      question: body.question,
      answer: body.answer,
      collection_id: body.collectionId || null,
      tags: body.tags || [],
      priority: body.priority || 0,
      user_id: c.get("userId"),
      created_at: Date.now(),
    })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ faq: data }, 201);
});

// PATCH /knowledge/faqs/:id
faqs.patch("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("knowledge_faqs")
    .update(body)
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("userId"))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ faq: data });
});

// DELETE /knowledge/faqs/:id
faqs.delete("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const { error } = await supabase
    .from("knowledge_faqs")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("user_id", c.get("userId"));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// POST /knowledge/faqs/generate - AI generates FAQs from documents
faqs.post("/generate", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{ documentId?: string; content?: string; count?: number }>();

  let content = body.content || "";
  if (body.documentId && !content) {
    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("content, user_id")
      .eq("document_id", body.documentId)
      .eq("user_id", c.get("userId"))
      .limit(10);
    content = (chunks || []).map((ch) => ch.content).join("\n\n");
  }

  // No specific source given — ground generation in a sample of the real knowledge base
  // instead of asking the model to invent generic questions from nothing.
  if (!content) {
    const { data: chunks } = await supabase
      .from("knowledge_chunks")
      .select("content")
      .eq("user_id", c.get("userId"))
      .limit(40);
    content = (chunks || []).map((ch) => ch.content).join("\n\n");
  }

  if (!content) {
    return c.json({ error: "Your knowledge base is empty. Upload documents or add FAQs manually before generating." }, 400);
  }

  const gemini = getGemini(c.env);
  const count = body.count || 10;
  const res = await gemini.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Generate ${count} frequently asked questions and detailed answers based on the provided content. Return JSON array: [{"question": "...", "answer": "...", "tags": ["tag1", "tag2"], "priority": 1-5}]. Only JSON, no other text.`,
      },
      { role: "user", content: content.slice(0, 4000) },
    ],
    max_tokens: 1500,
    temperature: 0.4,
  });

  try {
    const raw = res.choices[0]?.message?.content || "[]";
    const match = raw.match(/\[[\s\S]*\]/);
    const faqs = match ? JSON.parse(match[0]) : [];

    // Persist generated FAQs
    if (faqs.length) {
      const rows = faqs.map((f: { question: string; answer: string; tags?: string[]; priority?: number }) => ({
        question: f.question,
        answer: f.answer,
        tags: f.tags || ["gap"],
        priority: f.priority || 1,
        user_id: c.get("userId"),
        created_at: Date.now(),
      }));
      await supabase.from("knowledge_faqs").insert(rows);
    }

    return c.json({ faqs, count: faqs.length });
  } catch {
    return c.json({ error: "Failed to parse AI response" }, 500);
  }
});

export default faqs;

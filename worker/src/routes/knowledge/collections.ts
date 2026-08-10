import { Hono } from "hono";
import type { Env } from "../../index";
import { getSupabase } from "../../lib/supabase";

const collections = new Hono<{ Bindings: Env }>();

const ICONS = ["📚", "💡", "🔧", "💰", "⚖️", "🛍️", "🌐", "🔒"];
const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];

// GET /knowledge/collections
collections.get("/", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("knowledge_collections")
    .select("*, knowledge_documents(count)")
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    collections: (data || []).map((col) => ({
      id: col.id,
      name: col.name,
      description: col.description,
      color: col.color,
      icon: col.icon,
      documentCount: col.knowledge_documents?.[0]?.count || 0,
      createdAt: col.created_at,
    })),
  });
});

// POST /knowledge/collections
collections.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    name: string;
    description?: string;
    color?: string;
    icon?: string;
  }>();

  const idx = Math.floor(Math.random() * ICONS.length);
  const { data, error } = await supabase
    .from("knowledge_collections")
    .insert({
      name: body.name,
      description: body.description || "",
      color: body.color || COLORS[idx],
      icon: body.icon || ICONS[idx],
      created_at: Date.now(),
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ collection: data }, 201);
});

// PATCH /knowledge/collections/:id
collections.patch("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("knowledge_collections")
    .update(body)
    .eq("id", c.req.param("id"))
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ collection: data });
});

// DELETE /knowledge/collections/:id
collections.delete("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const { error } = await supabase
    .from("knowledge_collections")
    .delete()
    .eq("id", c.req.param("id"));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export default collections;

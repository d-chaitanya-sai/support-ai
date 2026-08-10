import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import authRoutes from "./routes/auth";
import ticketRoutes from "./routes/tickets";
import widgetChatRoute from "./routes/widget-chat";
import documentRoutes from "./routes/knowledge/documents";
import collectionRoutes from "./routes/knowledge/collections";
import faqRoutes from "./routes/knowledge/faqs";
import crawlerRoutes from "./routes/knowledge/crawler";
import searchRoutes from "./routes/knowledge/search";
import aiRoutes from "./routes/ai";
import demoRoutes from "./routes/demo";
import analyticsRoutes from "./routes/analytics";

export interface Env {
  // Secrets (set via wrangler secret put)
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GROQ_API_KEY: string;

  // Vars (from wrangler.toml)
  ALLOWED_ORIGIN: string;

  // Cloudflare AI binding
  AI: {
    run(model: string, input: unknown): Promise<unknown>;
  };
}

type Variables = {
  userId: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const allowed = c.env.ALLOWED_ORIGIN || "http://localhost:3000";
      const allowedOrigins = allowed.split(",").map((o: string) => o.trim());
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return origin || "*";
      }
      return null;
    },

    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 86400,
  })
);

// Auth Middleware
app.use("*", async (c, next) => {
  // Public routes that don't need user context
  const publicPaths = ["/", "/health", "/auth/sync-user", "/widget/chat", "/widget/chat/messages", "/widget/chat/tickets", "/widget/chat/poll"];
  const path = new URL(c.req.url).pathname;
  
  if (publicPaths.some(p => path === p || path.startsWith(p + "/"))) {
    return next();
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.substring(7);
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);
  
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  c.set("userId", user.id);
  await next();
});

// Health
app.get("/", (c) => c.json({ status: "ok", service: "SupportAI Worker", version: "1.0.0" }));
app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// Routes
app.route("/auth", authRoutes);
app.route("/tickets", ticketRoutes);
app.route("/widget/chat", widgetChatRoute);
app.route("/knowledge/documents", documentRoutes);
app.route("/knowledge/collections", collectionRoutes);
app.route("/knowledge/faqs", faqRoutes);
app.route("/knowledge/crawl", crawlerRoutes);
app.route("/knowledge/search", searchRoutes);
app.route("/ai", aiRoutes);
app.route("/demo", demoRoutes);
app.route("/analytics", analyticsRoutes);

// Knowledge stats endpoint
app.get("/knowledge/stats", async (c) => {
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);

  const [docs, chunks, collections, faqs, crawls, logs] = await Promise.all([
    supabase.from("knowledge_documents").select("id, status, type", { count: "exact" }).eq("user_id", c.get("userId")),
    supabase.from("knowledge_chunks").select("id", { count: "exact" }).eq("user_id", c.get("userId")),
    supabase.from("knowledge_collections").select("id", { count: "exact" }).eq("user_id", c.get("userId")),
    supabase.from("knowledge_faqs").select("id", { count: "exact" }).eq("user_id", c.get("userId")),
    supabase.from("crawl_jobs").select("id, status").eq("user_id", c.get("userId")),
    supabase.from("knowledge_search_logs")
      .select("response_time, retrieved_chunks, created_at")
      .eq("user_id", c.get("userId"))
      .gte("created_at", Date.now() - 86400000), // last 24h
  ]);

  const today = logs.data || [];
  const avgLatency = today.length
    ? today.reduce((s, l) => s + (l.response_time || 0), 0) / today.length
    : 0;

  const readyDocs = (docs.data || []).filter((d) => d.status === "ready").length;

  return c.json({
    totalDocuments: docs.count || 0,
    readyDocuments: readyDocs,
    totalChunks: chunks.count || 0,
    totalEmbeddings: chunks.count || 0,
    totalCollections: collections.count || 0,
    totalFaqs: faqs.count || 0,
    webPages: (docs.data || []).filter((d) => d.type === "url").length || 0,
    searchesToday: today.length,
    avgSearchLatencyMs: Math.round(avgLatency),
    crawlJobs: (crawls.data || []).length,
  });
});

// AI audit log — real trace of AI/agent actions per ticket
app.get("/audit", async (c) => {
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);
  const limit = parseInt(c.req.query("limit") || "50");
  
  const { data: tickets } = await supabase.from("tickets").select("id").eq("owner_id", c.get("userId"));
  const ticketIds = (tickets || []).map(t => t.id);

  if (ticketIds.length === 0) {
    return c.json({ logs: [] });
  }

  const { data, error } = await supabase
    .from("ai_audit_log")
    .select("*, tickets(title)")
    .in("ticket_id", ticketIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    logs: (data || []).map((r: Record<string, any>) => ({
      id: r.id,
      ticketId: r.ticket_id,
      ticketTitle: r.tickets?.title,
      action: r.action,
      actorName: r.actor_name,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
  });
});

// Processing queue
app.get("/knowledge/queue", async (c) => {
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("processing_queue")
    .select("*, knowledge_documents(title, type)")
    .eq("user_id", c.get("userId"))
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ queue: data || [] });
});

// Knowledge settings
app.get("/knowledge/settings", async (c) => {
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);
  const { data } = await supabase
    .from("knowledge_settings")
    .select("*")
    .eq("user_id", c.get("userId"))
    .single();
  return c.json({
    settings: data || {
      chunkSize: 500,
      chunkOverlap: 50,
      topK: 5,
      similarityThreshold: 0.5,
      maxContext: 3000,
      autoReindex: false,
      embeddingModel: "@cf/baai/bge-base-en-v1.5",
    },
  });
});

app.patch("/knowledge/settings", async (c) => {
  const { getSupabase } = await import("./lib/supabase");
  const supabase = getSupabase(c.env);
  const body = await c.req.json();
  const { data, error } = await supabase
    .from("knowledge_settings")
    .upsert({ user_id: c.get("userId"), ...body }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ settings: data });
});

export default app;

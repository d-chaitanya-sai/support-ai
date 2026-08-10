import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";

const analytics = new Hono<{ Bindings: Env }>();

analytics.get("/", async (c) => {
  const supabase = getSupabase(c.env);

  const [ticketsRes, logsRes, repliesRes, assistRes] = await Promise.all([
    supabase.from("tickets").select("id, status, category, sentiment, urgency, language, csat, created_at, updated_at, tags"),
    supabase.from("knowledge_search_logs").select("query, retrieved_chunks, response_time, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("ticket_replies").select("id, ticket_id, sender_name, created_at"),
    supabase.from("ticket_assist_messages").select("id, ticket_id"),
  ]);

  const tickets = ticketsRes.data || [];
  const logs = logsRes.data || [];
  const replies = repliesRes.data || [];

  const totalChatsApprox = logs.length;
  const ticketedFromDemo = tickets.filter((t) => (t.tags || []).includes("demo") || true);
  const openTickets = tickets.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS").length;
  const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;

  // Deflection: searches that didn't create pressure — approximate as zero-ticket ratio of high-confidence searches
  const answeredWell = logs.filter((l) => (l.retrieved_chunks || 0) > 0).length;
  const deflectionRate = totalChatsApprox > 0 ? Math.round((answeredWell / totalChatsApprox) * 100) : 0;

  const gapQueries = logs.filter((l) => (l.retrieved_chunks || 0) === 0).slice(0, 20);
  const kbCoverage = totalChatsApprox > 0 ? Math.round((answeredWell / totalChatsApprox) * 100) : 0;

  const csatValues = tickets.map((t) => t.csat).filter((v): v is number => typeof v === "number");
  const avgCsat = csatValues.length
    ? Math.round((csatValues.reduce((a, b) => a + b, 0) / csatValues.length) * 10) / 10
    : null;

  const byLanguage: Record<string, number> = {};
  for (const t of tickets) {
    const lang = t.language || "en";
    byLanguage[lang] = (byLanguage[lang] || 0) + 1;
  }

  const sentimentTrend = { happy: 0, neutral: 0, angry: 0 };
  for (const t of tickets) {
    const s = (t.sentiment || "neutral") as keyof typeof sentimentTrend;
    if (sentimentTrend[s] !== undefined) sentimentTrend[s]++;
  }

  const aiReplies = replies.filter((r) =>
    String(r.sender_name || "").toLowerCase().includes("ai")
  ).length;
  const agentAiAdoption = replies.length > 0 ? Math.round((assistRes.data?.length || 0) / Math.max(tickets.length, 1) * 10) : 0;

  // Topic heatmap — cluster by first word / category via tickets
  const topics: Record<string, number> = {};
  for (const t of tickets) {
    const key = t.category || "General";
    topics[key] = (topics[key] || 0) + 1;
  }

  const avgLatency =
    logs.length > 0
      ? Math.round(logs.reduce((s, l) => s + (l.response_time || 0), 0) / logs.length)
      : 0;

  return c.json({
    deflectionRate,
    kbCoverage,
    avgCsat,
    openTickets,
    resolved,
    totalTickets: tickets.length,
    sentimentTrend,
    byLanguage,
    topics,
    gapQueries: gapQueries.map((g) => ({ query: g.query, createdAt: g.created_at })),
    avgSearchLatencyMs: avgLatency,
    searchesAnalyzed: totalChatsApprox,
    aiAssistMessages: assistRes.data?.length || 0,
    agentAiAdoptionScore: Math.min(100, agentAiAdoption * 10),
    estimatedCostPerResolution: resolved > 0 ? `$${(0.02 + (avgLatency / 1000) * 0.001).toFixed(3)}` : "n/a",
  });
});

export default analytics;

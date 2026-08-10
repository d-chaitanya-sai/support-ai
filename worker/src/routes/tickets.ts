import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";
import { analyzeTicket } from "../lib/ai-utils";
import { redactPii } from "../lib/pii";

const tickets = new Hono<{ Bindings: Env }>();

// POST /tickets/bulk — bulk triage (must be before /:id)
tickets.post("/bulk", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    ids: string[];
    status?: string;
    priority?: string;
    urgency?: string;
  }>();

  if (!body.ids?.length) return c.json({ error: "ids required" }, 400);

  const updates: Record<string, unknown> = { updated_at: Date.now() };
  if (body.status) updates.status = body.status;
  if (body.priority) updates.priority = body.priority;
  if (body.urgency) updates.urgency = body.urgency;

  const { data, error } = await supabase.from("tickets").update(updates).in("id", body.ids).select();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ tickets: (data || []).map(mapTicket) });
});

// GET /tickets - all tickets sorted by urgency+sentiment
tickets.get("/", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);

  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sentimentOrder = { angry: 0, neutral: 1, happy: 2 };
  const sorted = (data || []).sort((a, b) => {
    const uA = urgencyOrder[a.urgency as keyof typeof urgencyOrder] ?? 3;
    const uB = urgencyOrder[b.urgency as keyof typeof urgencyOrder] ?? 3;
    const sA = sentimentOrder[a.sentiment as keyof typeof sentimentOrder] ?? 1;
    const sB = sentimentOrder[b.sentiment as keyof typeof sentimentOrder] ?? 1;
    const scoreA = uA * 10 + sA;
    const scoreB = uB * 10 + sB;
    return scoreA - scoreB || b.created_at - a.created_at;
  });

  return c.json({ tickets: sorted.map(mapTicket) });
});

// GET /tickets/:id/conversation — widget msgs + agent replies for agent view
tickets.get("/:id/conversation", async (c) => {
  const supabase = getSupabase(c.env);
  const id = c.req.param("id");

  const [widgetRes, repliesRes] = await Promise.all([
    supabase
      .from("widget_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("ticket_replies")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (widgetRes.error) return c.json({ error: widgetRes.error.message }, 500);
  if (repliesRes.error) return c.json({ error: repliesRes.error.message }, 500);

  const widgetMessages = (widgetRes.data || []).map(mapWidgetMessage);
  const replies = (repliesRes.data || []).map(mapReply);

  // Deduplicate replies that are mirrored in widget_messages
  const timeline = [
    ...widgetMessages.map((m) => {
      let speaker: "customer" | "ai" | "agent" = "customer";
      if (m.role === "assistant") speaker = "ai";
      if (m.role === "agent") speaker = "agent";
      
      return {
        id: m.id,
        kind: "widget" as const,
        speaker,
        role: m.role,
        senderName: speaker === "customer" ? "Customer" : speaker === "agent" ? "Agent" : "AI Assistant",
        content: m.content,
        createdAt: m.createdAt,
      };
    }),
    ...replies.map((r) => {
      const name = String(r.senderName || "Agent");
      const isAi =
        /ai\s*(bot|assist|assistant)?/i.test(name) ||
        name.toLowerCase().includes("pre-escalation");
      return {
        id: r.id,
        kind: "reply" as const,
        speaker: isAi ? ("ai" as const) : ("agent" as const),
        role: "agent" as const,
        senderName: isAi ? name : name,
        content: String(r.message || "").replace(/^\[Agent\]\s*/i, ""),
        createdAt: Number(r.createdAt) || 0,
      };
    }),
  ].sort((a, b) => Number(a.createdAt) - Number(b.createdAt));

  // Remove duplicates where a reply was mirrored to a widget message with the same content (or [Agent] prefix)
  const dedupedTimeline = timeline.filter((item, index, self) => {
    if (item.kind === 'reply') {
      const hasMirroredWidgetMsg = self.some(
        other => other.kind === 'widget' && (other.content === item.content || other.content === `[Agent] ${item.content}`)
      );
      if (hasMirroredWidgetMsg) return false;
    }
    return true;
  });

  return c.json({ widgetMessages, replies, timeline: dedupedTimeline });
});

// GET /tickets/:id/assist
tickets.get("/:id/assist", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("ticket_assist_messages")
    .select("*")
    .eq("ticket_id", c.req.param("id"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    messages: (data || []).map((m) => ({
      id: m.id,
      ticketId: m.ticket_id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
});

// POST /tickets/:id/assist — save one or more assist messages
tickets.post("/:id/assist", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{
    role?: string;
    content?: string;
    messages?: Array<{ role: string; content: string }>;
  }>();

  const ticketId = c.req.param("id");
  const rows = body.messages?.length
    ? body.messages.map((m) => ({
        ticket_id: ticketId,
        role: m.role,
        content: m.content,
        created_at: Date.now(),
      }))
    : [
        {
          ticket_id: ticketId,
          role: body.role || "user",
          content: body.content || "",
          created_at: Date.now(),
        },
      ];

  if (!rows[0]?.content) return c.json({ error: "content required" }, 400);

  const { data, error } = await supabase.from("ticket_assist_messages").insert(rows).select();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ messages: data }, 201);
});

// GET /tickets/:id/similar — simple text similarity via ILIKE on category/title
tickets.get("/:id/similar", async (c) => {
  const supabase = getSupabase(c.env);
  const id = c.req.param("id");
  const { data: ticket } = await supabase.from("tickets").select("*").eq("id", id).single();
  if (!ticket) return c.json({ error: "Not found" }, 404);

  const { data } = await supabase
    .from("tickets")
    .select("*")
    .neq("id", id)
    .or(`category.eq.${ticket.category},intent.eq.${ticket.intent || "General"}`)
    .order("created_at", { ascending: false })
    .limit(5);

  return c.json({
    similar: (data || []).map(mapTicket),
    hint:
      (data || []).filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length > 0
        ? `${(data || []).filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length} similar tickets were resolved — check their replies for patterns.`
        : "No resolved similar tickets yet.",
  });
});

// GET /tickets/:id
tickets.get("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", c.req.param("id"))
    .single();

  if (error || !data) return c.json({ error: "Not found" }, 404);
  return c.json({ ticket: mapTicket(data) });
});

// POST /tickets - create ticket with AI analysis + optional chat history
tickets.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();

  const safeTitle = redactPii(body.title || "");
  const safeDescription = redactPii(body.description || "");

  let analysis = { intent: "General", sentiment: "neutral", urgency: "low", language: "en" };
  try {
    analysis = await analyzeTicket(c.env, `${safeTitle}. ${safeDescription}`);
  } catch (e) {
    console.error("Analysis failed:", e);
  }

  let ownerId = body.ownerId || null;

  if (!ownerId && body.widgetId) {
    const { data: owner } = await supabase
      .from("users")
      .select("id")
      .eq("widget_id", body.widgetId)
      .single();
    if (owner) ownerId = owner.id;
  }

  const now = Date.now();
  const ticket = {
    title: safeTitle,
    description: safeDescription,
    status: "OPEN",
    priority: body.priority || "MEDIUM",
    category: body.category || "General",
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    urgency: analysis.urgency,
    language: analysis.language,
    owner_id: ownerId,
    owner_name: body.ownerName || null,
    owner_email: body.ownerEmail || null,
    ai_suggested_solution: body.suggestedSolution || null,
    tags: body.tags || [],
    widget_id: body.widgetId || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from("tickets").insert(ticket).select().single();

  if (error) return c.json({ error: error.message }, 500);

  // Persist conversation history linked to this ticket
  const messages: Array<{ role: string; content: string }> = body.messages || [];
  if (body.widgetId && messages.length > 0) {
    const rows = messages
      .filter((m) => m.content && m.role !== "system")
      .map((m, i) => ({
        widget_id: body.widgetId,
        role: m.role,
        content: redactPii(m.content),
        type: "text",
        ticket_id: data.id,
        created_at: now - (messages.length - i) * 1000,
      }));
    if (rows.length) {
      await supabase.from("widget_messages").insert(rows);
    }
  } else if (body.widgetId) {
    // Stamp any unlinked recent messages for this widget
    await supabase
      .from("widget_messages")
      .update({ ticket_id: data.id })
      .eq("widget_id", body.widgetId)
      .is("ticket_id", null);
  }

  await supabase.from("ai_audit_log").insert({
    ticket_id: data.id,
    action: "ticket.created",
    actor_name: body.ownerName || "system",
    metadata: { source: body.widgetId ? "widget" : "dashboard" },
    created_at: now,
  });

  return c.json({ ticket: mapTicket(data) }, 201);
});

// PATCH /tickets/:id
tickets.patch("/:id", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();
  const allowed: Record<string, unknown> = { updated_at: Date.now() };

  const fields: Array<[string, string]> = [
    ["status", "status"],
    ["priority", "priority"],
    ["category", "category"],
    ["assignedTo", "assigned_to"],
    ["aiSummary", "ai_summary"],
    ["aiSuggestedReply", "ai_suggested_reply"],
    ["csat", "csat"],
    ["agentActive", "agent_active"],
    ["resolutionCode", "resolution_code"],
  ];
  for (const [camel, snake] of fields) {
    if (body[camel] !== undefined) allowed[snake] = body[camel];
    if (body[snake] !== undefined) allowed[snake] = body[snake];
  }

  const { data, error } = await supabase
    .from("tickets")
    .update(allowed)
    .eq("id", c.req.param("id"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ticket: mapTicket(data) });
});

// GET /tickets/:id/replies
tickets.get("/:id/replies", async (c) => {
  const supabase = getSupabase(c.env);
  const { data, error } = await supabase
    .from("ticket_replies")
    .select("*")
    .eq("ticket_id", c.req.param("id"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ replies: (data || []).map(mapReply) });
});

// POST /tickets/:id/replies
tickets.post("/:id/replies", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json();

  const reply = {
    ticket_id: c.req.param("id"),
    sender_id: body.senderId || null,
    sender_name: body.senderName || "Agent",
    message: redactPii(body.message || ""),
    message_en: body.messageEn || body.message,
    language: body.language || "en",
    created_at: Date.now(),
  };

  const { data, error } = await supabase.from("ticket_replies").insert(reply).select().single();

  if (error) return c.json({ error: error.message }, 500);

  // If agent takeover is active, also mirror reply into widget_messages for the customer
  const { data: ticket } = await supabase
    .from("tickets")
    .select("widget_id, agent_active")
    .eq("id", c.req.param("id"))
    .single();

  if (ticket?.agent_active && ticket.widget_id) {
    await supabase.from("widget_messages").insert({
      widget_id: ticket.widget_id,
      role: "agent",
      content: reply.message,
      type: "text",
      ticket_id: c.req.param("id"),
      created_at: Date.now(),
    });
  }

  if (body.fromAi) {
    await supabase.from("ai_audit_log").insert({
      ticket_id: c.req.param("id"),
      action: "ai.reply_sent",
      actor_id: body.senderId || null,
      actor_name: body.senderName || "Agent",
      created_at: Date.now(),
    });
  }

  return c.json({ reply: mapReply(data) }, 201);
});

function mapTicket(t: Record<string, unknown>) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    intent: t.intent,
    sentiment: t.sentiment,
    urgency: t.urgency,
    language: t.language,
    ownerId: t.owner_id,
    ownerName: t.owner_name,
    ownerEmail: t.owner_email,
    assignedTo: t.assigned_to,
    aiSummary: t.ai_summary,
    aiSuggestedReply: t.ai_suggested_reply,
    aiSuggestedSolution: t.ai_suggested_solution,
    tags: t.tags,
    csat: t.csat ?? null,
    agentActive: t.agent_active ?? false,
    widgetId: t.widget_id ?? null,
    resolutionCode: t.resolution_code ?? null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

function mapReply(r: Record<string, unknown>) {
  return {
    id: r.id,
    ticketId: r.ticket_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    message: r.message,
    messageEn: r.message_en,
    language: r.language,
    createdAt: r.created_at,
  };
}

function mapWidgetMessage(m: Record<string, unknown>) {
  return {
    id: m.id,
    widgetId: m.widget_id,
    role: m.role,
    content: m.content,
    originalLanguage: m.original_language,
    type: m.type,
    ticketDraft: m.ticket_draft,
    ticketId: m.ticket_id,
    createdAt: m.created_at,
  };
}

export default tickets;

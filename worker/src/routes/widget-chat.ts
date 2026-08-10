import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";
import { getGroq, MODEL } from "../lib/groq";
import {
  buildRagContext,
  analyzeTicket,
} from "../lib/ai-utils";
import { redactPii, looksLikeJailbreak } from "../lib/pii";

const widgetChat = new Hono<{ Bindings: Env }>();

const SYSTEM_PROMPT = `You are SupportAI, a warm and professional customer support assistant.

Your goal:
1. Understand the user's issue with max 2-3 clarifying questions.
2. STRICTLY answer using ONLY the COMPANY KNOWLEDGE BASE context provided below. If the answer is not in the context, DO NOT guess or make up information. Politely state that you do not have that information and offer to create a support ticket.
3. If the user asks out-of-domain questions (e.g. writing poems, coding, general facts), politely decline and state you are a specialized support assistant for this company.
4. If the issue requires account/technical action, a refund/billing decision, or anything you cannot verify from the knowledge base, do NOT claim it is resolved — say a human agent will follow up.
5. NEVER promise free refunds, free upgrades, or policy exceptions that are not in the knowledge base.
6. Always collect more details about the user's problem. Structure these details and output them in a JSON block wrapped in <payload>...</payload> tags. This payload will be saved to help the user.

RESOLUTION RULE:
Include the exact token [RESOLVED] at the end of your reply ONLY when ALL of these are true:
- You gave a complete, specific answer grounded in the COMPANY KNOWLEDGE BASE context (not a guess or generic statement).
- The answer fully addresses what the user asked — nothing further is needed from a human or from the user.
- The user has not asked something you're unsure about or that needs account-specific action.
If any of those aren't true — including when you don't have enough knowledge base context — do NOT include [RESOLVED]; instead say you'll get a human agent to help.

Keep responses concise, friendly, and empathetic. Max 3 paragraphs.`;

widgetChat.post("/", async (c) => {
  const supabase = getSupabase(c.env);
  const groq = getGroq(c.env);
  const start = Date.now();

  const body = await c.req.json<{
    widgetId: string;
    message: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    collectionIds?: string[];
    query_embedding?: number[];
    ticketId?: string;
  }>();

  const { widgetId, collectionIds, ticketId } = body;
  let message = body.message || "";
  const messages = body.messages || [];

  if (!widgetId || !message) {
    return c.json({ error: "widgetId and message required" }, 400);
  }

  let currentTicketId = ticketId;
  let isAgentActive = false;

  if (currentTicketId) {
    const { data: ticketCheck } = await supabase
      .from("tickets")
      .select("agent_active")
      .eq("id", currentTicketId)
      .single();
    if (ticketCheck?.agent_active) {
      isAgentActive = true;
    }
  }

  const now = Date.now();
  const isNewTicket = !currentTicketId;

  if (isNewTicket) {
    const safeTitle = redactPii(message).substring(0, 50) + "...";
    let ownerId = null;
    const { data: owner } = await supabase
      .from("users")
      .select("id")
      .eq("widget_id", widgetId)
      .single();
    if (owner) ownerId = owner.id;

    const { data: newTicket } = await supabase
      .from("tickets")
      .insert({
        title: safeTitle,
        description: redactPii(message),
        status: "OPEN",
        priority: "MEDIUM",
        category: "General",
        owner_id: ownerId,
        widget_id: widgetId,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (newTicket) {
      currentTicketId = newTicket.id;
    }
  }

  if (isAgentActive) {
    await supabase.from("widget_messages").insert([
      {
        widget_id: widgetId,
        role: "user",
        content: message,
        type: "text",
        ticket_id: currentTicketId,
        created_at: now,
      }
    ]);
    return c.json({ paused: true, ticketId: currentTicketId });
  }

  if (looksLikeJailbreak(message)) {
    return c.json({
      type: "text",
      message:
        "I can only help with support questions about our product and policies. How can I assist you with your account or order?",
      sources: [],
      language: "en",
      confidence: "low",
      latencyMs: Date.now() - start,
      blocked: true,
    });
  }

  message = redactPii(message);

  // 1. Classify the message — language, intent, sentiment, urgency in one call.
  // This is what drives escalation: urgency/sentiment feed the dashboard's
  // critical/angry alerting and ticket sort order, so it must run on every
  // turn (not just once) to catch a customer getting angrier as the chat goes on.
  const analysis = await analyzeTicket(c.env, message).catch(() => ({
    intent: "General",
    sentiment: "neutral" as const,
    urgency: "low" as const,
    language: "en",
  }));
  const lang = analysis.language || "en";
  const URGENCY_TO_PRIORITY: Record<string, string> = {
    critical: "URGENT",
    high: "HIGH",
    medium: "MEDIUM",
    low: "LOW",
  };

  if (currentTicketId) {
    await supabase
      .from("tickets")
      .update({
        sentiment: analysis.sentiment,
        urgency: analysis.urgency,
        intent: analysis.intent,
        language: lang,
        priority: URGENCY_TO_PRIORITY[analysis.urgency] || "MEDIUM",
        updated_at: now,
      })
      .eq("id", currentTicketId);
  }

  // 2. RAG
  let ragContext = "";
  let retrievedChunks: Array<{ content: string; similarity: number; documentTitle: string }> = [];
  try {
    const embedding = body.query_embedding;
    if (!embedding) throw new Error("Missing query_embedding");

    let query = supabase.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_count: 5,
      similarity_threshold: 0.2,
    });

    if (collectionIds?.length) {
      query = supabase.rpc("match_knowledge_chunks_filtered", {
        query_embedding: embedding,
        match_count: 5,
        similarity_threshold: 0.2,
        collection_filter: collectionIds,
      });
    }

    const { data: chunks } = await query;
    if (chunks?.length) {
      retrievedChunks = chunks;
      ragContext = `\n\nCOMPANY KNOWLEDGE BASE:\n${buildRagContext(chunks)}\n\nUse the above context to answer the user's question when relevant.`;
    }
  } catch (e) {
    console.error("RAG failed:", e);
  }

  const topSim = retrievedChunks[0]?.similarity ?? 0;
  const confidence: "high" | "medium" | "low" =
    topSim >= 0.55 ? "high" : topSim >= 0.35 ? "medium" : "low";

  const languageInstruction =
    lang !== "en"
      ? `\n\nIMPORTANT: The user writes in language code "${lang}". Always respond in the SAME language.`
      : "";

  const confidenceNote =
    confidence === "low"
      ? "\n\nIf knowledge base match is weak, say you may not have enough information and offer a ticket."
      : "";

  const systemContent = SYSTEM_PROMPT + ragContext + languageInstruction + confidenceNote;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({ role: m.role, content: redactPii(m.content) })),
      { role: "user", content: message },
    ],
    temperature: 0.5,
    max_tokens: 800,
    stream: false,
  });

  const raw = completion.choices[0]?.message?.content || "";
  const nowAfterAI = Date.now();

  let responseType: "text" | "resolved" = "text";
  
  let payloadStr = "{}";
  const payloadMatch = raw.match(/<payload>([\s\S]*?)<\/payload>/);
  if (payloadMatch) {
    payloadStr = payloadMatch[1];
    try {
      const payloadObj = JSON.parse(payloadStr);
      await supabase.from("tickets").update({ payload: payloadObj }).eq("id", currentTicketId);
    } catch (e) {
      console.error("Failed to parse payload JSON:", e);
    }
  }

  let cleanContent = raw
    .replace(/<payload>[\s\S]*?<\/payload>/g, "")
    .replace("[RESOLVED]", "")
    .trim();

  // Only honor an AI-claimed resolution when it's actually grounded in a
  // confident knowledge-base match — otherwise a hallucinated "solved" answer
  // could close a ticket that genuinely needs a human.
  if (raw.includes("[RESOLVED]") && confidence !== "low") {
    responseType = "resolved";
    await supabase.from("tickets").update({ status: "RESOLVED" }).eq("id", currentTicketId);
  }

  // Persist this turn
  await supabase.from("widget_messages").insert([
    {
      widget_id: widgetId,
      role: "user",
      content: message,
      original_language: lang,
      type: "text",
      ticket_id: currentTicketId,
      created_at: nowAfterAI,
    },
    {
      widget_id: widgetId,
      role: "assistant",
      content: cleanContent,
      original_language: lang,
      type: responseType,
      ticket_id: currentTicketId,
      created_at: nowAfterAI + 1,
    },
  ]);

  const elapsed = Date.now() - start;
  if (retrievedChunks.length > 0) {
    await supabase.from("knowledge_search_logs").insert({
      query: message,
      retrieved_chunks: retrievedChunks.length,
      response_time: elapsed,
      tokens: completion.usage?.total_tokens || 0,
      created_at: nowAfterAI,
    });
  } else {
    // Log zero-hit for gap analysis
    await supabase.from("knowledge_search_logs").insert({
      query: message,
      retrieved_chunks: 0,
      response_time: elapsed,
      tokens: completion.usage?.total_tokens || 0,
      created_at: nowAfterAI,
    });
  }

  const sources = retrievedChunks.map((ch, i) => ({
    index: i + 1,
    documentTitle: ch.documentTitle,
    similarity: parseFloat((ch.similarity * 100).toFixed(1)),
    content: ch.content.slice(0, 100) + "...",
  }));

  // Agent takeover: surface latest agent replies
  let agentMessages: Array<{ content: string; createdAt: number }> = [];
  if (widgetId) {
    const { data: openTicket } = await supabase
      .from("tickets")
      .select("id")
      .eq("widget_id", widgetId)
      .eq("agent_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openTicket) {
      const since = now - 600000;
      const { data: agentReplies } = await supabase
        .from("ticket_replies")
        .select("message, created_at, sender_name")
        .eq("ticket_id", openTicket.id)
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      agentMessages = (agentReplies || []).map((r) => ({
        content: r.message,
        createdAt: r.created_at,
      }));
    }
  }

  return c.json({
    type: responseType,
    message: cleanContent,
    ticketId: currentTicketId,
    sources,
    language: lang,
    confidence,
    confidenceScore: Math.round(topSim * 100),
    latencyMs: elapsed,
    agentMessages,
  });
});

// GET /widget/chat/messages/:widgetId
widgetChat.get("/messages/:widgetId", async (c) => {
  const supabase = getSupabase(c.env);
  const widgetId = c.req.param("widgetId");
  const { data, error } = await supabase
    .from("widget_messages")
    .select("*")
    .eq("widget_id", widgetId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    messages: (data || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      type: m.type,
      ticketDraft: m.ticket_draft,
      ticketId: m.ticket_id,
      createdAt: m.created_at,
    })),
  });
});

// GET /widget/chat/poll/:widgetId — agent takeover polling
widgetChat.get("/poll/:widgetId", async (c) => {
  const supabase = getSupabase(c.env);
  const widgetId = c.req.param("widgetId");
  const since = Number(c.req.query("since") || 0);

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, agent_active, status")
    .eq("widget_id", widgetId)
    .eq("agent_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ticket) {
    return c.json({ agentActive: false, messages: [] });
  }

  const { data: msgs } = await supabase
    .from("widget_messages")
    .select("*")
    .eq("ticket_id", ticket.id)
    .gt("created_at", since)
    .order("created_at", { ascending: true });

  return c.json({
    agentActive: true,
    ticketId: ticket.id,
    messages: (msgs || []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  });
});

// GET /widget/chat/tickets/:widgetId - past tickets for this widget
widgetChat.get("/tickets/:widgetId", async (c) => {
  const supabase = getSupabase(c.env);
  const widgetId = c.req.param("widgetId");
  const { data, error } = await supabase
    .from("tickets")
    .select("id, title, status, created_at, updated_at")
    .eq("widget_id", widgetId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ tickets: data || [] });
});

export default widgetChat;

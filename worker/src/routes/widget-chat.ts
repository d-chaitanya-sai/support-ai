import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";
import { getGemini, MODEL } from "../lib/gemini";
import {
  buildRagContext,
  analyzeTicket,
} from "../lib/ai-utils";
import { redactPii, looksLikeJailbreak } from "../lib/pii";

const widgetChat = new Hono<{ Bindings: Env }>();

const SYSTEM_PROMPT = `You are AI E-commerce Support Assistant, a warm and professional customer support assistant.

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
  try {
    const supabase = getSupabase(c.env);
    const gemini = getGemini(c.env);
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

    const { data: owner, error: ownerErr } = await supabase
      .from("users")
      .select("id")
      .eq("widget_id", widgetId)
      .maybeSingle();

    if (ownerErr) {
      console.error("Owner lookup error:", ownerErr);
      return c.json({ error: `Database error: ${ownerErr.message}` }, 500);
    }

    const widgetUserId = owner?.id;
    if (!widgetUserId) {
      return c.json({ error: "Invalid widget ID" }, 400);
    }

    let currentTicketId = ticketId;

    const now = Date.now();
    const isNewTicket = !currentTicketId;

    if (isNewTicket) {
      const safeTitle = redactPii(message).substring(0, 50) + "...";
      let ownerId = widgetUserId;

      const { data: newTicket, error: ticketErr } = await supabase
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
        .maybeSingle();

      if (ticketErr) {
        console.error("Ticket create error:", ticketErr);
      }

      if (newTicket) {
        currentTicketId = newTicket.id;
      }
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
    const analysis = await analyzeTicket(c.env, message).catch((e) => {
      console.warn("analyzeTicket fallback:", e);
      return {
        intent: "General",
        sentiment: "neutral" as const,
        urgency: "low" as const,
        language: "en",
      };
    });
    const lang = analysis.language || "en";
    const URGENCY_TO_PRIORITY: Record<string, string> = {
      critical: "URGENT",
      high: "HIGH",
      medium: "MEDIUM",
      low: "LOW",
    };

    if (currentTicketId) {
      const { error: ticketUpdateErr } = await supabase
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

      if (ticketUpdateErr) {
        console.error("Ticket update error:", ticketUpdateErr);
      }
    }

    // 2. RAG
    let ragContext = "";
    let retrievedChunks: Array<{ content: string; similarity: number; documentTitle: string }> = [];
    try {
      let embedding = body.query_embedding;
      if (!embedding && c.env.AI) {
        const aiPromise = c.env.AI.run("@cf/baai/bge-base-en-v1.5", {
          text: [message],
        });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AI embedding timeout")), 3000));
        
        const embedResponse: any = await Promise.race([aiPromise, timeoutPromise]).catch((e) => console.warn("AI binding embed error:", e));
        if (embedResponse?.data?.[0]) {
          embedding = embedResponse.data[0];
        }
      }

      if (embedding) {
        let query = supabase.rpc("match_knowledge_chunks", {
          query_embedding: embedding,
          match_count: 50,
          similarity_threshold: 0.2,
        });

        if (collectionIds?.length) {
          query = supabase.rpc("match_knowledge_chunks_filtered", {
            query_embedding: embedding,
            match_count: 50,
            similarity_threshold: 0.2,
            collection_filter: collectionIds,
          });
        }

        const { data: chunks } = await query;
        if (chunks?.length) {
          const { data: allowedChunks } = await supabase
            .from("knowledge_chunks")
            .select("id")
            .eq("user_id", widgetUserId)
            .in("id", chunks.map((c: any) => c.id));
            
          const allowedSet = new Set((allowedChunks || []).map((c: any) => c.id));
          retrievedChunks = chunks.filter((c: any) => allowedSet.has(c.id)).slice(0, 5);
          
          if (retrievedChunks.length > 0) {
            ragContext = `\n\nCOMPANY KNOWLEDGE BASE:\n${buildRagContext(retrievedChunks)}\n\nUse the above context to answer the user's question when relevant.`;
          }
        }
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

    const completion = await gemini.chat.completions.create({
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

    if (raw.includes("[RESOLVED]") && confidence !== "low" && currentTicketId) {
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
    const { error: logErr } = await supabase.from("knowledge_search_logs").insert({
      query: message,
      retrieved_chunks: retrievedChunks.length,
      response_time: elapsed,
      tokens: completion.usage?.total_tokens || 0,
      user_id: widgetUserId,
      created_at: nowAfterAI,
    });
    if (logErr) {
      console.warn("Search log insert skipped:", logErr);
    }

    const sources = retrievedChunks.map((ch, i) => ({
      index: i + 1,
      documentTitle: ch.documentTitle,
      similarity: parseFloat((ch.similarity * 100).toFixed(1)),
      content: ch.content.slice(0, 100) + "...",
    }));

    return c.json({
      type: responseType,
      message: cleanContent,
      ticketId: currentTicketId,
      sources,
      language: lang,
      confidence,
      confidenceScore: Math.round(topSim * 100),
      latencyMs: elapsed,
    });
  } catch (err: any) {
    console.error("widgetChat error:", err);
    return c.json({ error: err.message || "Internal server error" }, 500);
  }
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
  return c.json({ agentActive: false, messages: [] });
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

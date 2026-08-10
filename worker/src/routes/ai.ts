import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";
import { getGroq, MODEL } from "../lib/groq";
import { translateText } from "../lib/ai-utils";

const aiRoutes = new Hono<{ Bindings: Env }>();

// POST /ai/suggest-reply
aiRoutes.post("/suggest-reply", async (c) => {
  const supabase = getSupabase(c.env);
  const groq = getGroq(c.env);
  const body = await c.req.json<{
    ticketId: string;
    tone?: "shorter" | "friendly" | "professional" | "default";
  }>();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", body.ticketId)
    .single();

  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  const { data: replies } = await supabase
    .from("ticket_replies")
    .select("*")
    .eq("ticket_id", body.ticketId)
    .order("created_at", { ascending: true })
    .limit(10);

  const toneMap: Record<string, string> = {
    shorter: "Keep the reply brief — 2-3 sentences max.",
    friendly: "Use a warm, friendly, casual tone with emojis where appropriate.",
    professional: "Use a formal, professional corporate tone.",
    default: "Use a helpful, empathetic, professional tone.",
  };

  const tone = toneMap[body.tone || "default"];
  const conversation = (replies || [])
    .map((r: Record<string, unknown>) => `${r.sender_name as string}: ${r.message as string}`)
    .join("\n");

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a customer support agent. Write a reply to this support ticket.
${tone}
Start with a greeting if it's the first reply. Sign off with "Best regards, Support Team".
Return ONLY the reply text, no labels or metadata.

TICKET:
Title: ${ticket.title}
Description: ${ticket.description}
Category: ${ticket.category}
Priority: ${ticket.priority}
${conversation ? `\nPREVIOUS CONVERSATION:\n${conversation}` : ""}`,
      },
      { role: "user", content: "Generate a reply for this ticket." },
    ],
    max_tokens: 400,
    temperature: 0.6,
  });

  const reply = res.choices[0]?.message?.content?.trim() || "";

  // Optionally translate if ticket has a non-English language
  let translatedReply = reply;
  if (ticket.language && ticket.language !== "en") {
    translatedReply = await translateText(c.env, reply, ticket.language).catch(() => reply);
  }

  await supabase.from("ai_audit_log").insert({
    ticket_id: body.ticketId,
    action: "ai.suggest_reply",
    metadata: { tone: body.tone || "default" },
    created_at: Date.now(),
  });

  return c.json({ reply, replyTranslated: translatedReply, language: ticket.language });
});

// POST /ai/score-reply — empathy / clarity / policy-risk
aiRoutes.post("/score-reply", async (c) => {
  const groq = getGroq(c.env);
  const { reply, ticketContext } = await c.req.json<{ reply: string; ticketContext?: string }>();

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Score this support reply 0-100 for empathy, clarity, and policyRisk (higher policyRisk = more likely to promise something unsafe). Return ONLY JSON:
{"empathy":0-100,"clarity":0-100,"policyRisk":0-100,"notes":"one sentence"}`,
      },
      {
        role: "user",
        content: `Ticket context: ${ticketContext || "n/a"}\n\nReply:\n${reply}`,
      },
    ],
    max_tokens: 150,
    temperature: 0,
  });

  try {
    const raw = res.choices[0]?.message?.content || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return c.json(match ? JSON.parse(match[0]) : { empathy: 70, clarity: 70, policyRisk: 20, notes: "" });
  } catch {
    return c.json({ empathy: 70, clarity: 70, policyRisk: 20, notes: "Could not score" });
  }
});

// POST /ai/assist-chat — non-streaming agent copilot for a ticket
aiRoutes.post("/assist-chat", async (c) => {
  const supabase = getSupabase(c.env);
  const groq = getGroq(c.env);
  const body = await c.req.json<{
    ticketId: string;
    message: string;
    history?: Array<{ role: string; content: string }>;
  }>();

  const { data: ticket } = await supabase.from("tickets").select("*").eq("id", body.ticketId).single();
  if (!ticket) return c.json({ error: "Ticket not found" }, 404);

  const { data: replies } = await supabase
    .from("ticket_replies")
    .select("*")
    .eq("ticket_id", body.ticketId)
    .order("created_at", { ascending: true })
    .limit(20);

  const { data: widgetMsgs } = await supabase
    .from("widget_messages")
    .select("*")
    .eq("ticket_id", body.ticketId)
    .order("created_at", { ascending: true })
    .limit(30);

  const thread = [
    ...(widgetMsgs || []).map((m) => `${m.role}: ${m.content}`),
    ...(replies || []).map((r) => `agent(${r.sender_name}): ${r.message}`),
  ].join("\n");

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are an AI copilot for support agents. Be concise and actionable.
Help with summaries, reply drafts, priority advice, and resolution steps.
TICKET:
Title: ${ticket.title}
Description: ${ticket.description}
Status: ${ticket.status} | Priority: ${ticket.priority} | Sentiment: ${ticket.sentiment} | Urgency: ${ticket.urgency}
Category: ${ticket.category} | Intent: ${ticket.intent}
${ticket.ai_suggested_solution ? `Suggested solution: ${ticket.ai_suggested_solution}` : ""}

CUSTOMER THREAD:
${thread || "(empty)"}`,
      },
      ...(body.history || []).slice(-8).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: body.message },
    ],
    max_tokens: 500,
    temperature: 0.5,
  });

  const content = res.choices[0]?.message?.content?.trim() || "I couldn't generate a response.";

  // Persist both turns
  await supabase.from("ticket_assist_messages").insert([
    { ticket_id: body.ticketId, role: "user", content: body.message, created_at: Date.now() },
    { ticket_id: body.ticketId, role: "assistant", content, created_at: Date.now() + 1 },
  ]);

  return c.json({ content });
});

// POST /ai/summarize
aiRoutes.post("/summarize", async (c) => {
  const supabase = getSupabase(c.env);
  const groq = getGroq(c.env);
  const { ticketId } = await c.req.json<{ ticketId: string }>();

  const { data: ticket } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .single();

  if (!ticket) return c.json({ error: "Not found" }, 404);

  const { data: replies } = await supabase
    .from("ticket_replies")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  const conversation = (replies || [])
    .map((r: Record<string, unknown>) => `[${r.sender_name as string}]: ${r.message as string}`)
    .join("\n");

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Summarize this support ticket conversation. Return JSON:
{
  "mainIssue": "One sentence",
  "attemptedSolutions": ["solution 1", "solution 2"],
  "currentStatus": "One sentence",
  "recommendation": "Next step recommendation"
}
Only JSON, no other text.`,
      },
      {
        role: "user",
        content: `Title: ${ticket.title}\nDescription: ${ticket.description}\n\nConversation:\n${conversation || "(No replies yet)"}`,
      },
    ],
    max_tokens: 300,
    temperature: 0.3,
  });

  try {
    const raw = res.choices[0]?.message?.content || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    const summary = match ? JSON.parse(match[0]) : {};

    // Save to ticket
    await supabase.from("tickets").update({ ai_summary: raw }).eq("id", ticketId);
    return c.json({ summary });
  } catch {
    return c.json({ error: "Failed to parse summary" }, 500);
  }
});

// POST /ai/translate
aiRoutes.post("/translate", async (c) => {
  const { text, targetLanguage } = await c.req.json<{
    text: string;
    targetLanguage: string;
  }>();
  const translated = await translateText(c.env, text, targetLanguage);
  return c.json({ translated, targetLanguage });
});

// POST /ai/analyze
aiRoutes.post("/analyze", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  const groq = getGroq(c.env);

  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Analyze this text and return JSON:
{
  "intent": "Refund|Bug|Feature Request|Sales|Billing|Technical|Account|Complaint|General",
  "sentiment": "happy|neutral|angry",
  "urgency": "low|medium|high|critical",
  "language": "en|es|hi|fr|ja|...",
  "confidence": 0.0-1.0
}
Only JSON.`,
      },
      { role: "user", content: text.slice(0, 500) },
    ],
    max_tokens: 100,
    temperature: 0,
  });

  try {
    const raw = res.choices[0]?.message?.content || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return c.json(match ? JSON.parse(match[0]) : {});
  } catch {
    return c.json({ intent: "General", sentiment: "neutral", urgency: "low", language: "en", confidence: 0.5 });
  }
});

export default aiRoutes;

import type { Env } from "../index";
import { getGroq, MODEL } from "./groq";

export interface TicketAnalysis {
  intent: string;
  sentiment: "happy" | "neutral" | "angry";
  urgency: "low" | "medium" | "high" | "critical";
  language: string;
}

export interface TicketDraft {
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  category: string;
  intent: string;
  urgency: string;
  customerIssue: string;
  suggestedSolution: string;
}



/**
 * Detect language of text
 */
export async function detectLanguage(env: Env, text: string): Promise<string> {
  const groq = getGroq(env);
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          'Detect the language of the text. Reply with ONLY the ISO 639-1 language code (e.g. "en", "es", "hi", "ja", "fr"). Nothing else.',
      },
      { role: "user", content: text.slice(0, 200) },
    ],
    max_tokens: 5,
    temperature: 0,
  });
  return (res.choices[0]?.message?.content?.trim() || "en").toLowerCase();
}

/**
 * Analyze ticket for intent, sentiment, urgency, language
 */
export async function analyzeTicket(
  env: Env,
  text: string
): Promise<TicketAnalysis> {
  const groq = getGroq(env);
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Analyze the customer message and return ONLY a JSON object with these fields:
{
  "intent": one of: "Refund" | "Bug" | "Feature Request" | "Sales" | "Billing" | "Technical" | "Account" | "Complaint" | "General",
  "sentiment": one of: "happy" | "neutral" | "angry",
  "urgency": one of: "low" | "medium" | "high" | "critical",
  "language": ISO 639-1 code like "en", "es", "hi"
}
No other text, just the JSON.`,
      },
      { role: "user", content: text.slice(0, 500) },
    ],
    max_tokens: 100,
    temperature: 0,
  });

  try {
    const raw = res.choices[0]?.message?.content || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return match
      ? JSON.parse(match[0])
      : { intent: "General", sentiment: "neutral", urgency: "low", language: "en" };
  } catch {
    return { intent: "General", sentiment: "neutral", urgency: "low", language: "en" };
  }
}

/**
 * Generate a ticket draft from conversation history
 */
export async function generateTicketDraft(
  env: Env,
  conversation: string
): Promise<TicketDraft> {
  const groq = getGroq(env);
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Based on the conversation, generate a support ticket draft as JSON:
{
  "title": "Short clear title (max 10 words)",
  "description": "Full issue description",
  "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "category": "Billing" | "Technical" | "Account" | "General" | "Feature Request" | "Bug Report",
  "intent": "Refund" | "Bug" | "Feature Request" | "Sales" | "Billing" | "Technical" | "Account" | "Complaint" | "General",
  "urgency": "low" | "medium" | "high" | "critical",
  "customerIssue": "One sentence summary of the customer's problem",
  "suggestedSolution": "Recommended resolution steps"
}
Return ONLY the JSON, no other text.`,
      },
      { role: "user", content: conversation },
    ],
    max_tokens: 400,
    temperature: 0.3,
  });

  try {
    const raw = res.choices[0]?.message?.content || "{}";
    const match = raw.match(/\{[\s\S]*\}/);
    return match
      ? JSON.parse(match[0])
      : {
          title: "Support Request",
          description: "Customer needs assistance",
          priority: "MEDIUM",
          category: "General",
          intent: "General",
          urgency: "low",
          customerIssue: "Issue reported via chat",
          suggestedSolution: "Review and respond",
        };
  } catch {
    return {
      title: "Support Request",
      description: conversation.slice(0, 200),
      priority: "MEDIUM",
      category: "General",
      intent: "General",
      urgency: "low",
      customerIssue: "Issue reported via chat",
      suggestedSolution: "Review and respond",
    };
  }
}

/**
 * Translate text to target language
 */
export async function translateText(
  env: Env,
  text: string,
  targetLanguage: string
): Promise<string> {
  if (targetLanguage === "en") return text;
  const groq = getGroq(env);
  const res = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Translate the following text to ${targetLanguage}. Return ONLY the translated text, nothing else.`,
      },
      { role: "user", content: text },
    ],
    max_tokens: 600,
    temperature: 0.1,
  });
  return res.choices[0]?.message?.content?.trim() || text;
}

/**
 * Split text into chunks for embedding
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50
): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(" ");
    if (chunk.trim()) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Build RAG context from retrieved chunks
 */
export function buildRagContext(
  chunks: Array<{ content: string; similarity: number; documentTitle?: string }>
): string {
  return chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}${c.documentTitle ? ` - ${c.documentTitle}` : ""} (similarity: ${(c.similarity * 100).toFixed(0)}%)]\n${c.content}`
    )
    .join("\n\n---\n\n");
}

import { Hono } from "hono";
import type { Env } from "../index";
import { getSupabase } from "../lib/supabase";

const demo = new Hono<{ Bindings: Env }>();

/** POST /demo/seed — idempotent demo data for the current user */
demo.post("/seed", async (c) => {
  const supabase = getSupabase(c.env);
  const body = await c.req.json<{ userId?: string; widgetId?: string; ownerName?: string; ownerEmail?: string }>();
  const { userId, widgetId, ownerName, ownerEmail } = body;

  if (!userId || !widgetId) {
    return c.json({ error: "userId and widgetId required" }, 400);
  }

  const now = Date.now();

  // Remove prior demo-tagged tickets for this owner
  const { data: existing } = await supabase
    .from("tickets")
    .select("id")
    .eq("owner_id", userId)
    .contains("tags", ["demo"]);

  const existingIds = (existing || []).map((t) => t.id);
  if (existingIds.length) {
    await supabase.from("ticket_assist_messages").delete().in("ticket_id", existingIds);
    await supabase.from("ticket_replies").delete().in("ticket_id", existingIds);
    await supabase.from("widget_messages").delete().in("ticket_id", existingIds);
    await supabase.from("tickets").delete().in("id", existingIds);
  }

  const seeds = [
    {
      title: "Order #4821 never arrived — furious customer",
      description:
        "Customer waited 12 days for Order #4821. Tracking shows delivered but they never received it. Demanding full refund immediately.",
      status: "OPEN",
      priority: "URGENT",
      category: "Shipping",
      intent: "Refund",
      sentiment: "angry",
      urgency: "critical",
      language: "en",
      tags: ["demo", "shipping", "refund"],
    },
    {
      title: "How do I change my billing email?",
      description: "User wants to update the email on their Pro plan invoice from old@example.com to new@example.com.",
      status: "OPEN",
      priority: "MEDIUM",
      category: "Billing",
      intent: "Billing",
      sentiment: "neutral",
      urgency: "medium",
      language: "en",
      tags: ["demo", "billing"],
    },
    {
      title: "Loved the new dashboard — quick thank you",
      description: "Customer loves the redesigned analytics. No action needed; positive feedback.",
      status: "RESOLVED",
      priority: "LOW",
      category: "Feedback",
      intent: "General",
      sentiment: "happy",
      urgency: "low",
      language: "en",
      tags: ["demo", "feedback"],
      csat: 5,
    },
  ];

  const createdTickets = [];
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const { data: ticket, error } = await supabase
      .from("tickets")
      .insert({
        ...s,
        owner_id: userId,
        owner_name: ownerName || "Demo Customer",
        owner_email: ownerEmail || "demo@customer.com",
        widget_id: widgetId,
        ai_suggested_solution:
          i === 0
            ? "Offer replacement shipment or full refund per 14-day shipping policy."
            : null,
        created_at: now - (i + 1) * 3600000,
        updated_at: now - (i + 1) * 3600000,
      })
      .select()
      .single();

    if (error || !ticket) {
      console.error("Seed ticket failed:", error);
      continue;
    }
    createdTickets.push(ticket);

    if (i === 0) {
      const conversation = [
        { role: "user", content: "My order 4821 still hasn't shown up and tracking says delivered. This is unacceptable!" },
        {
          role: "assistant",
          content:
            "I'm really sorry about that. I checked our shipping policy — if a package is marked delivered but missing, we can reship or refund within 14 days. Would you like me to create a ticket for our team?",
        },
        { role: "user", content: "Yes, create a ticket. I want a full refund NOW." },
        {
          role: "assistant",
          content: "I've prepared an urgent ticket for the refund team. They'll prioritize angry shipping cases.",
        },
      ];

      for (let j = 0; j < conversation.length; j++) {
        await supabase.from("widget_messages").insert({
          widget_id: widgetId,
          role: conversation[j].role,
          content: conversation[j].content,
          type: "text",
          ticket_id: ticket.id,
          created_at: now - (i + 1) * 3600000 + j * 60000,
        });
      }

      await supabase.from("ticket_assist_messages").insert([
        {
          ticket_id: ticket.id,
          role: "user",
          content: "Draft a professional reply to the customer",
          created_at: now - 100000,
        },
        {
          ticket_id: ticket.id,
          role: "assistant",
          content:
            "Hi there,\n\nI'm truly sorry your Order #4821 didn't arrive despite the delivered scan. Per our policy we can issue a full refund or send a replacement within 14 days of the delivery scan.\n\nI've flagged this as urgent — reply with your preferred option and we'll process it today.\n\nBest regards,\nSupport Team",
          created_at: now - 90000,
        },
      ]);

      await supabase.from("ticket_replies").insert({
        ticket_id: ticket.id,
        sender_name: "AI Bot (pre-escalation)",
        message: "Customer confirmed they want a full refund for missing Order #4821.",
        language: "en",
        created_at: now - 80000,
      });
    }
  }

  return c.json({
    ok: true,
    ticketsCreated: createdTickets.length,
    ticketIds: createdTickets.map((t) => t.id),
  });
});

export default demo;

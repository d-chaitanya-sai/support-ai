"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { motion } from "framer-motion";
import { Webhook, Mail, MessageSquare } from "lucide-react";

export default function IntegrationsPage() {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const saveWebhook = () => {
    if (!webhookUrl.trim()) {
      toast.error("Enter an endpoint URL first");
      return;
    }
    try {
      localStorage.setItem("AI E-commerce Support Assistant_webhook", webhookUrl);
      toast.success("Webhook endpoint saved");
    } catch {
      toast.error("Could not save");
    }
  };

  const testWebhook = async () => {
    if (!webhookUrl.trim()) {
      toast.error("Enter an endpoint URL first");
      return;
    }
    setSendingTest(true);
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "ticket.created",
          ticketId: `test-${Date.now()}`,
          title: "AI E-commerce Support Assistant test event",
        }),
        mode: "no-cors",
      });
      // no-cors mode always resolves opaque responses — we can confirm the request
      // was sent, not that the receiver accepted it.
      toast.success("Test event sent — check your endpoint's logs to confirm receipt");
    } catch {
      toast.error("Request failed — check the URL and your network connection");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1 text-sm">Connect AI E-commerce Support Assistant to the tools your team already uses.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {[
          { key: "slack", icon: MessageSquare, color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20" },
          { key: "email", icon: Mail, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
        ].map((c, i) => (
          <motion.div key={c.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border-border/50 bg-card/50 opacity-70 hover:opacity-90 transition-opacity">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`inline-flex p-2 rounded-lg ${c.bg} border ${c.border} mb-2 w-fit`}>
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Coming soon
                  </span>
                </div>
                <CardTitle className="text-sm font-semibold">{c.key === "slack" ? "Slack" : "Email → ticket"}</CardTitle>
                <CardDescription className="text-xs">
                  {c.key === "slack"
                    ? "Get critical and angry-customer ticket alerts posted directly to a Slack channel."
                    : "Forward your support inbox to create AI-triaged tickets automatically."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label className="text-xs text-muted-foreground">{c.key === "slack" ? "Alert channel" : "Inbound address"}</Label>
                <Input disabled placeholder={c.key === "slack" ? "#support" : "support@yourcompany.com"} className="mt-1.5" />
              </CardContent>
            </Card>
          </motion.div>
        ))}

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="border-emerald-500/20 bg-card hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="inline-flex p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-2 w-fit">
                  <Webhook className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                </span>
              </div>
              <CardTitle className="text-sm font-semibold">Webhooks</CardTitle>
              <CardDescription className="text-xs">Events: ticket.created, chat.unresolved</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input
                  placeholder="https://hooks.example.com/…"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveWebhook}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={testWebhook} disabled={sendingTest}>
                  {sendingTest ? "Sending…" : "Send test"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

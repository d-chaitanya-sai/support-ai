"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Sparkles, Code2, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user } = useAuth();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const widgetUrl = user?.widgetId ? `${origin}/widgets/p/${user.widgetId}` : "";
  const embedSnippet = user?.widgetId
    ? `<!-- SupportAI Widget -->\n<script\n  src="${origin}/embed.js"\n  data-widget-id="${user.widgetId}"\n  async\n></script>`
    : "";

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const loadPreview = () => {
    if (!user?.widgetId) return;
    const w = window as unknown as { SupportAIWidget?: { open: () => void } };
    if (w.SupportAIWidget) {
      w.SupportAIWidget.open();
      return;
    }
    const script = document.createElement("script");
    script.src = `${origin}/embed.js`;
    script.setAttribute("data-widget-id", user.widgetId);
    script.async = true;
    script.onload = () => {
      (window as unknown as { SupportAIWidget?: { open: () => void } }).SupportAIWidget?.open();
    };
    document.body.appendChild(script);
    toast.success("Live widget loaded — try it in the corner");
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">Account details and your website chat widget.</p>
      </div>

      <div className="grid gap-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="inline-flex p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <User className="h-3.5 w-3.5 text-blue-500" />
              </div>
              Account Information
            </CardTitle>
            <CardDescription className="text-xs">Your personal profile details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-border">
                <AvatarImage src={user?.photoUrl} />
                <AvatarFallback className="text-sm font-medium">{user?.name?.charAt(0).toUpperCase() || "?"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user?.name || "Loading..."}</p>
                <p className="text-sm text-muted-foreground">{user?.email || "Loading..."}</p>
              </div>
            </div>
            <div className="pt-1 border-t border-border/50">
              <p className="text-sm font-medium text-muted-foreground pt-3">Widget ID</p>
              <code className="bg-muted px-2 py-1 rounded text-xs inline-block mt-1">{user?.widgetId || "Loading..."}</code>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        <Card className="border-border/50 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <div className="inline-flex p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <Code2 className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              Website chat widget
            </CardTitle>
            <CardDescription className="text-xs">
              One script tag adds a floating AI chat launcher to any website — no iframe wrangling required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Embed snippet</Label>
              <pre className="text-xs bg-zinc-950 text-zinc-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap font-mono ring-1 ring-white/10">{embedSnippet || "Sign in to get your snippet"}</pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => copy(embedSnippet, "Snippet")} disabled={!embedSnippet}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy snippet
                </Button>
                <Button variant="outline" size="sm" onClick={loadPreview} disabled={!user?.widgetId}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Preview on this page
                </Button>
              </div>
            </div>
            <div className="space-y-2 pt-1 border-t border-border/50">
              <Label className="text-muted-foreground">Or link directly to the widget</Label>
              <div className="flex gap-2">
                <Input readOnly value={widgetUrl} className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(widgetUrl, "URL")} disabled={!widgetUrl}>
                  <Copy className="h-4 w-4" />
                </Button>
                {widgetUrl && (
                  <a
                    href={widgetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted"
                    )}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

 
      </div>
    </div>
  );
}

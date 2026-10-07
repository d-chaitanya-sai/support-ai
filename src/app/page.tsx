"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, ArrowRight, Ticket, BookOpen, Globe, Zap, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

const FEATURES = [
  { icon: Bot, title: "AI Knowledge Base", desc: "RAG-powered search with pgvector", color: "text-purple-500", bg: "bg-purple-500/10" },
  { icon: Ticket, title: "Smart Ticket AI", desc: "Auto-detection, intent & sentiment", color: "text-blue-500", bg: "bg-blue-500/10" },
  { icon: BookOpen, title: "FAQ & Document Sync", desc: "AI-generated FAQs from your own knowledge base", color: "text-green-500", bg: "bg-green-500/10" },
  { icon: Globe, title: "Website Crawler", desc: "Import any website automatically", color: "text-orange-500", bg: "bg-orange-500/10" },
  { icon: Zap, title: "Edge-Native AI", desc: "Cloudflare Workers + Gemini LLM", color: "text-yellow-500", bg: "bg-yellow-500/10" },
  { icon: Shield, title: "10 AI Features", desc: "Translation, urgency, summaries", color: "text-pink-500", bg: "bg-pink-500/10" },
];

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const [authLoading, setAuthLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        }
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || "Authentication failed");
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] rounded-full bg-purple-500/5 blur-[80px]" />
      </div>

      {/* Top nav */}
      <header className="w-full border-b border-border/50 bg-background/70 backdrop-blur-xl sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight text-[15px]">AI E-commerce Support Assistant</span>
          </div>
          {user ? (
            <Button size="sm" onClick={() => router.push("/dashboard")} className="gap-1.5">
              Dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleGoogleSignIn} disabled={authLoading}>
              {authLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sign in"}
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }} className="w-full max-w-2xl mx-auto text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-primary text-primary-foreground rounded-3xl flex items-center justify-center shadow-2xl">
            <Bot className="h-10 w-10" />
          </div>
        </div>

        {/* Headline */}
 

        {/* CTA / Auth Form */}
        {user ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={() => router.push("/dashboard")} className="gap-2 h-12 px-8">
                Go to Dashboard <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6"
                onClick={() => router.push(`/widgets/p/${user.widgetId}`)}
              >
                Open demo widget
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.email}</span>
            </p>
            <Button variant="ghost" size="sm" onClick={logout} className="text-xs">Sign Out</Button>
          </div>
        ) : (
          <div className="max-w-sm mx-auto bg-card/80 border border-border rounded-2xl p-6 backdrop-blur-sm shadow-xl">
            <h2 className="text-xl font-bold mb-4">Welcome to AI E-commerce Support Assistant</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in to try RAG chat, smart tickets, and the agent inbox.
            </p>
            <Button 
              onClick={handleGoogleSignIn} 
              className="w-full h-11 bg-white text-black hover:bg-gray-100 flex items-center justify-center gap-2" 
              disabled={authLoading}
            >
              {authLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </Button>
          </div>
        )}

        {/* Features grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-left pt-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.06 }}
              className="p-4 rounded-xl border border-border bg-card/50 backdrop-blur-sm hover:bg-card hover:shadow-sm transition-all">
              <div className={`h-8 w-8 rounded-lg ${f.bg} flex items-center justify-center mb-3`}>
                <f.icon className={`h-4 w-4 ${f.color}`} />
              </div>
              <p className="text-sm font-medium">{f.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Loader2, AlertCircle } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  // Primary path: the global AuthProvider resolves the session (it already parses
  // the OAuth redirect URL). Once it settles, move on.
  useEffect(() => {
    if (!loading && session) {
      router.replace("/dashboard");
    }
  }, [loading, session, router]);

  // Backup: also listen directly in case this page's session resolves via an
  // event the provider's initial getSession() call raced past.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/dashboard");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Failsafe: if nothing resolves (expired/invalid link, blocked popup, etc.),
  // don't strand the user on a spinner forever.
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Sign-in is taking longer than expected</p>
          <p className="text-xs text-muted-foreground">
            The sign-in link may have expired. Please return home and try again.
          </p>
          <button
            onClick={() => router.replace("/")}
            className="text-sm underline text-foreground mt-2"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}

"use client";

import React, { createContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import type { User } from "@/types";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUser = useCallback(async (s: Session) => {
    try {
      const res = await fetch(`${WORKER_URL}/auth/sync-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.access_token}`,
        },
        body: JSON.stringify({
          id: s.user.id,
          name: s.user.user_metadata?.full_name || s.user.email?.split("@")[0] || "User",
          email: s.user.email || "",
          photoUrl: s.user.user_metadata?.avatar_url || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        console.error("Worker returned error status:", res.status);
        throw new Error("Worker sync failed");
      }
    } catch (e) {
      console.error("Failed to sync user:", e);
      // Fallback: construct user from session
      setUser({
        id: s.user.id,
        name: s.user.user_metadata?.full_name || s.user.email?.split("@")[0] || "User",
        email: s.user.email || "",
        photoUrl: s.user.user_metadata?.avatar_url || "",
        widgetId: s.user.id, // fallback
        createdAt: Date.now(),
      });
    }
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        syncUser(s).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s) {
          await syncUser(s);
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [syncUser]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const value = React.useMemo(() => ({
    user, session, loading, logout
  }), [user, session, loading, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

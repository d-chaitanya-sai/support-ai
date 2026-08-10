import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../index";

let _client: SupabaseClient | null = null;

export function getSupabase(env: Env): SupabaseClient {
  if (!_client) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in worker environment. Did you forget to add them to .dev.vars or restart the worker?");
    }
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

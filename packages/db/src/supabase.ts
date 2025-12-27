import { createClient } from "@supabase/supabase-js";

export type SupabaseClientConfig = {
  url?: string;
  key?: string;
};

export function createSupabaseClient(config: SupabaseClientConfig = {}) {
  const url = config.url || process.env.SUPABASE_URL;
  const key = config.key || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSupabaseAnonClient() {
  return createSupabaseClient();
}

"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Browser-side Supabase client, used only for Realtime broadcast
// subscriptions. The anon key is publishable by design — it grants nothing
// beyond what RLS/channel config allows (and we expose no tables to it).
// Returns null when the public env vars aren't configured, so realtime
// quietly degrades to polling instead of breaking the page.
export function getSupabaseBrowser(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

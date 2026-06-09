import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export interface PortfolioSnapshotRow {
  captured_at: string;
  total_nok: number | null;
  cash_nok: number | null;
  polymarket_bets_nok: number | null;
  polymarket_cash_nok: number | null;
  phantom_nok: number | null;
  usd_nok: number | null;
  sol_usd: number | null;
}

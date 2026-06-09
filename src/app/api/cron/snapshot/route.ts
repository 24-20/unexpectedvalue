import "server-only";
import type { NextRequest } from "next/server";
import { getLiveBalances } from "@/lib/balances";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function hourBucket(ms: number): string {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function n(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let balances;
  try {
    balances = await getLiveBalances();
  } catch (err) {
    return Response.json(
      { ok: false, stage: "balances", error: String(err) },
      { status: 502 },
    );
  }

  const row = {
    captured_at: new Date(balances.fetchedAt).toISOString(),
    hour_bucket: hourBucket(balances.fetchedAt),
    total_nok: (() => {
      const cash = balances.cash.totalNok;
      const bets = balances.polymarketBets.valueNok;
      if (cash == null && bets == null) return null;
      return (cash ?? 0) + (bets ?? 0);
    })(),
    cash_nok: n(balances.cash.totalNok),
    polymarket_bets_nok: n(balances.polymarketBets.valueNok),
    polymarket_cash_nok: n(balances.cash.polymarketCash.nok),
    phantom_nok: n(balances.cash.phantom.nok),
    polymarket_bets_usd: n(balances.polymarketBets.valueUsd),
    polymarket_cash_usdc: n(balances.cash.polymarketCash.usdc),
    phantom_usd: n(balances.cash.phantom.usd),
    phantom_sol: n(balances.cash.phantom.sol),
    phantom_stable_usd: n(balances.cash.phantom.stableUsd),
    usd_nok: n(balances.rates.usdNok),
    sol_usd: n(balances.rates.solUsd),
    raw: balances,
  };

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("portfolio_snapshots")
    .upsert(row, { onConflict: "hour_bucket" });

  if (error) {
    return Response.json(
      { ok: false, stage: "insert", error: error.message },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    capturedAt: row.captured_at,
    hourBucket: row.hour_bucket,
    totalNok: row.total_nok,
  });
}

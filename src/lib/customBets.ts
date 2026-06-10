import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { ActivityEvent, PolymarketPosition } from "@/lib/balances";

interface CustomBetRow {
  id: string;
  bookie: string;
  title: string;
  outcome: string;
  icon_url: string | null;
  market_url: string | null;
  stake_usd: number | string;
  odds_decimal: number | string;
  placed_at: string;
  ends_at: string | null;
  settled_at: string | null;
  status: "pending" | "won" | "lost" | "void" | "cashed_out";
  settled_amount_usd: number | string | null;
  notes: string | null;
}

export interface CustomBetsResult {
  positions: PolymarketPosition[];
  activity: ActivityEvent[];
  pendingStakeUsd: number;
  realizedPnlUsd: number;
}

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export async function fetchCustomBets(): Promise<CustomBetsResult | null> {
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return null;
  }

  try {
    const { data, error } = await sb
      .from("custom_bets")
      .select("*")
      .order("placed_at", { ascending: false })
      .limit(500);
    if (error || !data) return null;

    const rows = data as CustomBetRow[];
    const positions: PolymarketPosition[] = [];
    const activity: ActivityEvent[] = [];
    let pendingStakeUsd = 0;
    let realizedPnlUsd = 0;

    for (const r of rows) {
      const stake = num(r.stake_usd);
      const odds = num(r.odds_decimal);
      const placedMs = Date.parse(r.placed_at);
      const settledMs = r.settled_at ? Date.parse(r.settled_at) : 0;
      const settledAmount = num(r.settled_amount_usd);

      // Realized PnL per status. Pending contributes 0 — custom_bets have no
      // mark-to-market since we don't track live odds.
      if (r.status === "won") {
        const proceeds = settledAmount > 0 ? settledAmount : stake * odds;
        realizedPnlUsd += proceeds - stake;
      } else if (r.status === "lost") {
        realizedPnlUsd -= stake;
      } else if (r.status === "cashed_out" && settledAmount > 0) {
        realizedPnlUsd += settledAmount - stake;
      }
      // void → refund, net 0

      // Placement event — money out
      activity.push({
        source: r.bookie,
        timestamp: Number.isNaN(placedMs) ? 0 : placedMs,
        type: "TRADE",
        side: "BUY",
        usdcSize: stake,
        title: r.title,
        slug: r.id,
        icon: r.icon_url,
        outcome: r.outcome,
        price: odds > 0 ? 1 / odds : null, // implied probability
        shares: null,
        txHash: r.id,
        pnlUsd: null,
        soldPct: null,
      });

      // Settlement event (if applicable)
      if (r.status !== "pending" && r.settled_at) {
        const ts = Number.isNaN(settledMs) ? 0 : settledMs;
        if (r.status === "won") {
          const proceeds = settledAmount > 0 ? settledAmount : stake * odds;
          activity.push({
            source: r.bookie,
            timestamp: ts,
            type: "REDEEM",
            side: null,
            usdcSize: proceeds,
            title: r.title,
            slug: r.id,
            icon: r.icon_url,
            outcome: r.outcome,
            price: null,
            shares: null,
            txHash: `${r.id}-won`,
            pnlUsd: proceeds - stake,
            soldPct: null,
          });
        } else if (r.status === "lost") {
          activity.push({
            source: r.bookie,
            timestamp: ts,
            type: "LOST",
            side: null,
            usdcSize: 0,
            title: r.title,
            slug: r.id,
            icon: r.icon_url,
            outcome: r.outcome,
            price: null,
            shares: null,
            txHash: `${r.id}-lost`,
            pnlUsd: -stake,
            soldPct: null,
          });
        } else if (r.status === "void") {
          const refund = settledAmount > 0 ? settledAmount : stake;
          activity.push({
            source: r.bookie,
            timestamp: ts,
            type: "REDEEM",
            side: null,
            usdcSize: refund,
            title: r.title,
            slug: r.id,
            icon: r.icon_url,
            outcome: r.outcome,
            price: null,
            shares: null,
            txHash: `${r.id}-void`,
            pnlUsd: refund - stake,
            soldPct: null,
          });
        } else if (r.status === "cashed_out") {
          activity.push({
            source: r.bookie,
            timestamp: ts,
            type: "TRADE",
            side: "SELL",
            usdcSize: settledAmount,
            title: r.title,
            slug: r.id,
            icon: r.icon_url,
            outcome: r.outcome,
            price: null,
            shares: null,
            txHash: `${r.id}-cashout`,
            pnlUsd: settledAmount - stake,
            // A cashout closes the whole ticket — there's no partial cashout
            // concept in the custom_bets table.
            soldPct: 100,
          });
        }
      }

      // Pending bets become active positions, carrying the stake as currentValue.
      // size follows Polymarket semantics — $1-claims paid out on a win — so it
      // must be the potential payout (stake × odds), not the stake.
      if (r.status === "pending") {
        const impliedPrice = odds > 0 ? 1 / odds : 0;
        positions.push({
          source: r.bookie,
          title: r.title,
          slug: r.id,
          icon: r.icon_url,
          outcome: r.outcome,
          size: odds > 0 ? stake * odds : stake,
          avgPrice: impliedPrice,
          curPrice: impliedPrice,
          initialValue: stake,
          currentValue: stake,
          cashPnl: 0,
          percentPnl: 0,
          endDate: r.ends_at,
          redeemable: false,
          status: "open",
        });
        pendingStakeUsd += stake;
      }
    }

    return { positions, activity, pendingStakeUsd, realizedPnlUsd };
  } catch {
    return null;
  }
}

export interface PendingBookieBet {
  id: string;
  bookie: string;
  title: string;
  outcome: string;
  stakeUsd: number;
  oddsDecimal: number;
  placedAt: string;
  endsAt: string | null;
}

// Pending bookie bets for the admin settle panel.
export async function fetchPendingBookieBets(): Promise<PendingBookieBet[]> {
  let sb;
  try {
    sb = getSupabaseAdmin();
  } catch {
    return [];
  }

  try {
    const { data, error } = await sb
      .from("custom_bets")
      .select("id, bookie, title, outcome, stake_usd, odds_decimal, placed_at, ends_at")
      .eq("status", "pending")
      .order("placed_at", { ascending: false });
    if (error || !data) return [];
    return (data as Pick<
      CustomBetRow,
      | "id"
      | "bookie"
      | "title"
      | "outcome"
      | "stake_usd"
      | "odds_decimal"
      | "placed_at"
      | "ends_at"
    >[]).map((r) => ({
      id: r.id,
      bookie: r.bookie,
      title: r.title,
      outcome: r.outcome,
      stakeUsd: num(r.stake_usd),
      oddsDecimal: num(r.odds_decimal),
      placedAt: r.placed_at,
      endsAt: r.ends_at,
    }));
  } catch {
    return [];
  }
}

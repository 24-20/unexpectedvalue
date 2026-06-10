import type { ActivityEvent } from "@/lib/balances";

export type ActivityValueKind = "amount" | "pnl" | "legacy";

// How a history row's value cell renders:
//  - "amount": money put in (buys / bookie placements) — plain kr, no sign
//  - "pnl": realized result of the event (sell / redeem / lost) — signed kr,
//    colored; only when the PnL is actually derivable
//  - "legacy": everything else (deposits, withdrawals, rewards) and any
//    sell/redeem whose cost basis is unknown — signed USD with kr beneath
export function activityValueKind(e: ActivityEvent): ActivityValueKind {
  if (e.type === "TRADE" && e.side === "BUY") return "amount";
  if (
    (e.type === "TRADE" && e.side === "SELL") ||
    e.type === "REDEEM" ||
    e.type === "LOST"
  ) {
    return e.pnlUsd != null ? "pnl" : "legacy";
  }
  return "legacy";
}

// "47%" — whole percents, with guards for float drift at the edges.
export function formatSoldPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "";
  if (pct < 1) return "<1%";
  return `${Math.min(100, Math.round(pct))}%`;
}

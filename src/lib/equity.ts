// Pure equity math shared by the server (SSR, cron snapshot, admin
// investment recording) and the client (live chart updates). No
// "server-only" import here, and nothing beyond types may be imported
// from server modules.
import type { LiveBalances } from "@/lib/balances";

// Total equity in NOK. Strict all-or-nothing: every leg (Polymarket cash,
// Phantom wallet, bets value) must be known. A partial sum — e.g. Phantom
// only because a Polymarket fetch got rate-limited — reads as a real equity
// crash, gets baked into the chart and ownership math, and is far worse
// than admitting the total is momentarily unknown. Null = unknown; callers
// fall back to the last snapshot / last good value instead.
export function liveTotalNok(b: LiveBalances): number | null {
  const polyCash = b.cash.polymarketCash.nok;
  const phantom = b.cash.phantom.nok;
  const bets = b.polymarketBets.valueNok;
  if (polyCash == null || phantom == null || bets == null) return null;
  return polyCash + phantom + bets;
}

// Lifetime betting PnL in NOK. Computed as
//   −buys + sells + redeems + rewards + currentValue(open positions) + customRealized
// across Polymarket. The activity walk picks up history that has dropped off
// the /positions API (redeemed winners stop appearing once you claim), while
// the currentValue sum picks up MTM of positions still on the book. Custom
// bets stay summed as realized — pending custom bets have no live odds, so
// no MTM. Strict like liveTotalNok: each term covers a different slice of
// history, so any missing input (FX rate, activity, positions, custom bets)
// makes the sum wrong rather than merely incomplete — return null instead.
export function livePnlNok(b: LiveBalances): number | null {
  const { usdNok } = b.rates;
  const { activity, positions } = b.polymarketBets;
  if (usdNok == null || activity == null || positions == null) return null;
  if (b.customBetsRealizedPnlUsd == null) return null;

  let pnlUsd = b.customBetsRealizedPnlUsd;
  for (const a of activity) {
    if (a.source !== "polymarket") continue;
    if (a.type === "TRADE" && a.side === "BUY") pnlUsd -= a.usdcSize;
    else if (a.type === "TRADE" && a.side === "SELL") pnlUsd += a.usdcSize;
    else if (a.type === "REDEEM" || a.type === "REWARD") pnlUsd += a.usdcSize;
  }
  for (const p of positions) {
    if (p.source !== "polymarket") continue;
    pnlUsd += p.currentValue ?? 0;
  }
  return pnlUsd * usdNok;
}

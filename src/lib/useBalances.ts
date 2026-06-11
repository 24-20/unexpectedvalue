"use client";

import { useEffect, useState } from "react";
import type { LiveBalances } from "@/lib/balances";

function pick<T>(next: T | null | undefined, prev: T | null | undefined): T | null {
  if (next !== null && next !== undefined) return next;
  if (prev !== null && prev !== undefined) return prev;
  return null;
}

function mergeBalances(prev: LiveBalances, next: LiveBalances): LiveBalances {
  const polymarketCash = {
    address: next.cash.polymarketCash.address || prev.cash.polymarketCash.address,
    usdc: pick(next.cash.polymarketCash.usdc, prev.cash.polymarketCash.usdc),
    nok: pick(next.cash.polymarketCash.nok, prev.cash.polymarketCash.nok),
  };
  const phantom = {
    address: next.cash.phantom.address || prev.cash.phantom.address,
    sol: pick(next.cash.phantom.sol, prev.cash.phantom.sol),
    stableUsd: pick(next.cash.phantom.stableUsd, prev.cash.phantom.stableUsd),
    usdcAccount: pick(
      next.cash.phantom.usdcAccount,
      prev.cash.phantom.usdcAccount,
    ),
    usd: pick(next.cash.phantom.usd, prev.cash.phantom.usd),
    nok: pick(next.cash.phantom.nok, prev.cash.phantom.nok),
  };

  // Recompute the cash total from the merged leaves so stale + fresh combine cleanly.
  const cashParts = [polymarketCash.nok, phantom.nok].filter(
    (v): v is number => v != null,
  );
  const totalNok =
    cashParts.length > 0 ? cashParts.reduce((s, v) => s + v, 0) : null;

  const positions =
    next.polymarketBets.positions ?? prev.polymarketBets.positions;
  const activity =
    next.polymarketBets.activity ?? prev.polymarketBets.activity;
  const betsValueUsd = pick(
    next.polymarketBets.valueUsd,
    prev.polymarketBets.valueUsd,
  );
  const betsValueNok = pick(
    next.polymarketBets.valueNok,
    prev.polymarketBets.valueNok,
  );

  return {
    fetchedAt: next.fetchedAt,
    cash: { totalNok, polymarketCash, phantom },
    polymarketBets: {
      address:
        next.polymarketBets.address || prev.polymarketBets.address,
      valueUsd: betsValueUsd,
      valueNok: betsValueNok,
      positions,
      activity,
    },
    customBetsRealizedPnlUsd: pick(
      next.customBetsRealizedPnlUsd,
      prev.customBetsRealizedPnlUsd,
    ),
    rates: {
      solUsd: pick(next.rates.solUsd, prev.rates.solUsd),
      usdNok: pick(next.rates.usdNok, prev.rates.usdNok),
    },
  };
}

// Polls /api/balances and merges each response over the previous one, so a
// leg that fails upstream keeps showing its last good value. `refreshNow`
// fires one immediate fetch on mount — used when the server-rendered data
// arrived incomplete, so recovery doesn't wait a full poll interval.
export function usePolledBalances(
  initial: LiveBalances,
  pollMs = 10_000,
  refreshNow = false,
): LiveBalances {
  const [data, setData] = useState<LiveBalances>(initial);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch("/api/balances", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as LiveBalances;
        if (!cancelled) setData((prev) => mergeBalances(prev, next));
      } catch {
        // Transient network failure — keep showing the last merged data.
      }
    };

    if (refreshNow) refresh();
    const pollId = setInterval(refresh, pollMs);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [pollMs, refreshNow]);

  return data;
}

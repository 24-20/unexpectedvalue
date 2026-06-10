"use client";

import { useEffect, useState } from "react";
import type { LiveBalances } from "@/lib/balances";

interface UseBalancesResult {
  data: LiveBalances;
  stale: boolean;
  elapsedSec: number;
}

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

const STALE_AFTER_FAILS = 2;

export function usePolledBalances(
  initial: LiveBalances,
  pollMs = 10_000,
): UseBalancesResult {
  const [data, setData] = useState<LiveBalances>(initial);
  const [stale, setStale] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let failCount = 0;

    const refresh = async () => {
      try {
        const res = await fetch("/api/balances", { cache: "no-store" });
        if (!res.ok) {
          failCount += 1;
          if (!cancelled && failCount >= STALE_AFTER_FAILS) setStale(true);
          return;
        }
        const next = (await res.json()) as LiveBalances;
        if (!cancelled) {
          setData((prev) => mergeBalances(prev, next));
          failCount = 0;
          setStale(false);
        }
      } catch {
        failCount += 1;
        if (!cancelled && failCount >= STALE_AFTER_FAILS) setStale(true);
      }
    };

    const pollId = setInterval(refresh, pollMs);
    const tickId = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
    };
  }, [pollMs]);

  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - data.fetchedAt) / 1000),
  );
  return { data, stale, elapsedSec };
}

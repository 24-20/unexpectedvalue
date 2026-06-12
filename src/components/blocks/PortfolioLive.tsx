"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Container } from "@/components/ui";
import { Holdings } from "./Holdings";
import { PolymarketBets } from "./PolymarketBets";
import { PortfolioChart, type LiveEquityPoint } from "./PortfolioChart";
import { usePolledBalances } from "@/lib/useBalances";
import { useAlertsChannel } from "@/lib/useAlertsChannel";
import { livePnlNok, liveTotalNok } from "@/lib/equity";
import type { LiveBalances } from "@/lib/balances";
import type { Range, SeriesByMetric } from "@/lib/portfolio";
import type { Owner } from "@/lib/owners";

interface PortfolioLiveProps {
  initial: LiveBalances;
  series: SeriesByMetric;
  ranges: { key: Range; label: string }[];
  owners: ReadonlyArray<Owner>;
  // Sum of all deposits, SSR-fresh only: /api/investors strips amounts, and
  // deposits change rarely enough that the next reload catching up is fine.
  totalDepositsNok: number;
  defaultRange?: Range;
  pollMs?: number;
}

// Owns the single /api/balances poll for the portfolio page and fans the
// merged result out to the chart, holdings, and bets blocks. Three things
// can trigger an immediate refetch ahead of the poll cadence: the server
// render arriving incomplete, a realtime change broadcast, and the tab
// regaining visibility.
export function PortfolioLive({
  initial,
  series,
  ranges,
  owners,
  totalDepositsNok,
  defaultRange = "1D",
  // Matches REVALIDATE_BALANCES server-side: polling faster than the data
  // cache revalidates only re-downloads identical JSON.
  pollMs = 5_000,
}: PortfolioLiveProps) {
  // kick > 0 forces an immediate balances fetch whenever it changes; start
  // at 1 when SSR data came in incomplete so healing doesn't wait.
  const [kick, setKick] = useState(() =>
    liveTotalNok(initial) == null ? 1 : 0,
  );
  const data = usePolledBalances(initial, pollMs, kick);

  // Owners list can change live (new investment shifts every percentage).
  const [liveOwners, setLiveOwners] = useState<ReadonlyArray<Owner>>(owners);

  const refetchOwners = useCallback(async () => {
    try {
      const res = await fetch("/api/investors", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { owners?: Owner[] };
      if (Array.isArray(body.owners) && body.owners.length > 0) {
        setLiveOwners(body.owners);
      }
    } catch {
      // Keep the last known list; the next event or reload will catch up.
    }
  }, []);

  // Realtime broadcast: a change event means fresh data exists *right now*.
  useAlertsChannel(
    useCallback(
      (kind) => {
        setKick((k) => k + 1);
        if (kind === "investment") void refetchOwners();
      },
      [refetchOwners],
    ),
  );

  // Returning to the tab refetches immediately instead of waiting out the
  // poll interval — the cheapest perceived-freshness win there is.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") setKick((k) => k + 1);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // Memoized by data identity: polls that fail or return nothing new must
  // not produce a fresh object, or the chart would redraw for no reason.
  const live = useMemo<LiveEquityPoint>(
    () => ({
      t: data.fetchedAt,
      equityNok: liveTotalNok(data),
      pnlNok: livePnlNok(data),
    }),
    [data],
  );

  return (
    <div>
      <PortfolioChart
        series={series}
        ranges={ranges}
        owners={liveOwners}
        totalDepositsNok={totalDepositsNok}
        defaultRange={defaultRange}
        live={live}
      />

      <div className="pt-4 sm:pt-6 md:pt-8 pb-4 sm:pb-6 md:pb-8 relative z-[70] bg-background">
        <Container className="px-3 sm:px-6">
          <Holdings data={data} />
        </Container>
      </div>

      <PolymarketBets data={data} />
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Container } from "@/components/ui";
import { Holdings } from "./Holdings";
import { PolymarketBets } from "./PolymarketBets";
import { PortfolioChart, type LiveEquityPoint } from "./PortfolioChart";
import { usePolledBalances } from "@/lib/useBalances";
import { livePnlNok, liveTotalNok } from "@/lib/equity";
import type { LiveBalances } from "@/lib/balances";
import type { Range, SeriesByMetric } from "@/lib/portfolio";
import type { Owner } from "@/lib/owners";

interface PortfolioLiveProps {
  initial: LiveBalances;
  series: SeriesByMetric;
  ranges: { key: Range; label: string }[];
  owners: ReadonlyArray<Owner>;
  defaultRange?: Range;
  pollMs?: number;
}

// Owns the single /api/balances poll for the portfolio page and fans the
// merged result out to the chart, holdings, and bets blocks. When the
// server render arrived incomplete (an upstream leg failed during SSR),
// the first refresh fires immediately so the page heals without waiting
// out a poll interval — or a manual reload.
export function PortfolioLive({
  initial,
  series,
  ranges,
  owners,
  defaultRange = "1D",
  // Matches REVALIDATE_BALANCES server-side: polling faster than the data
  // cache revalidates only re-downloads identical JSON.
  pollMs = 5_000,
}: PortfolioLiveProps) {
  const data = usePolledBalances(initial, pollMs, liveTotalNok(initial) == null);

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
        owners={owners}
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

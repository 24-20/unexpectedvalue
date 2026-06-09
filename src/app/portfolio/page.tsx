import { Suspense } from "react";
import { Container, Mono } from "@/components/ui";
import {
  Holdings,
  PolymarketBets,
  PortfolioChart,
} from "@/components/blocks";
import { METRICS, RANGES, getPortfolioSeries } from "@/lib/portfolio";
import { getLiveBalances, livePnlNok, liveTotalNok } from "@/lib/balances";

export default function PortfolioPage() {
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <PortfolioBody />
    </Suspense>
  );
}

async function PortfolioBody() {
  const balances = await getLiveBalances();
  const series = await getPortfolioSeries({
    equityNok: liveTotalNok(balances),
    pnlNok: livePnlNok(balances),
  });

  return (
    <div>
      <PortfolioChart
        series={series}
        ranges={RANGES}
        metrics={METRICS}
        defaultRange="1D"
        defaultMetric="equity"
      />

      <div className="pt-4 sm:pt-6 md:pt-8 pb-4 sm:pb-6 md:pb-8 relative z-[70] bg-background">
        <Container className="px-3 sm:px-6">
          <Holdings initial={balances} />
        </Container>
      </div>

      <PolymarketBets initial={balances} />
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div>
      <ChartSkeleton />

      <div className="pt-4 sm:pt-6 md:pt-8 pb-4 sm:pb-6 md:pb-8 relative z-[70] bg-background">
        <Container className="px-3 sm:px-6">
          <HoldingsSkeleton />
        </Container>
      </div>

      <BetsSkeleton />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface">
          <div className="p-6 border-b border-border">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Mono className="text-muted">Equity</Mono>
                <div className="mt-2 text-4xl md:text-5xl font-medium tabular-nums tracking-tight">
                  <Bar className="h-10 md:h-12 w-56 max-w-full" />
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-3 font-mono text-sm tabular-nums">
                  <span className="text-muted">Today</span>
                  <Bar className="h-3.5 w-14" />
                  <Bar className="h-3.5 w-20" />
                </div>
              </div>
            </div>
          </div>

          <div className="h-[300px] md:h-[420px] w-full px-3 sm:px-6 flex items-center">
            <div className="h-px w-full bg-border animate-pulse" />
          </div>

          <div className="p-3 md:p-4 flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <div
                key={r.key}
                className="px-3 md:px-4 py-2 min-w-[72px] flex-1 md:flex-initial rounded-lg bg-foreground/[0.05] flex flex-col items-center justify-center gap-0.5"
              >
                <span className="font-mono uppercase text-[11px] tracking-widest text-muted">
                  {r.label}
                </span>
                <Bar className="h-2.5 w-10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HoldingsSkeleton() {
  return (
    <div className="py-4 sm:py-5 flex items-center gap-6 sm:gap-8">
      <svg
        viewBox="0 0 80 80"
        className="w-24 sm:w-28 md:w-32 h-auto shrink-0"
        aria-hidden
      >
        <circle
          cx={40}
          cy={40}
          r={31}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={14}
          strokeDasharray="3 3"
        />
      </svg>

      <div className="flex-1 min-w-0">
        <div className="space-y-1.5 font-mono text-xs sm:text-sm tabular-nums">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 bg-border shrink-0"
            />
            <span className="text-muted">Cash in wallets</span>
            <Bar className="h-3 w-16" />
          </div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 bg-border shrink-0"
            />
            <span className="text-muted">Open bets</span>
            <Bar className="h-3 w-14" />
          </div>
        </div>
      </div>

    </div>
  );
}

function BetsSkeleton() {
  return (
    <div className="border-y border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface">
          <div className="px-3 py-3 border-b border-border flex items-center gap-2">
            <div className="inline-flex items-center bg-foreground/[0.05] rounded-lg p-1 gap-0.5">
              <div className="font-mono text-xs uppercase tracking-widest rounded-md px-3 py-1.5 bg-foreground/20 text-foreground">
                Active bets
              </div>
              <div className="font-mono text-xs uppercase tracking-widest rounded-md px-3 py-1.5 text-muted">
                History
              </div>
            </div>
            <div className="ml-auto font-mono text-[10px] uppercase tracking-widest rounded-lg bg-foreground/[0.05] text-muted px-3 py-2 flex items-center gap-2 whitespace-nowrap">
              <span>Filter</span>
              <span aria-hidden className="leading-none">
                ▾
              </span>
            </div>
          </div>
          <div className="min-h-[200px]">
            <table className="w-full border-collapse">
              <tbody>
                <BetRowSkeleton />
                <BetRowSkeleton />
                <BetRowSkeleton />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function BetRowSkeleton() {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 py-2.5 max-w-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 shrink-0 border border-border bg-transparent" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Bar className="h-3.5 w-48 max-w-full" />
            <Bar className="h-2 w-20 sm:hidden" />
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 hidden sm:table-cell">
        <div className="h-5 w-14 border border-border bg-transparent" />
      </td>
      <td className="px-4 py-2.5 hidden md:table-cell text-right">
        <Bar className="h-3 w-14 ml-auto" />
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <div className="inline-block space-y-1">
          <Bar className="h-3 w-14 ml-auto" />
          <Bar className="h-2 w-10 ml-auto" />
        </div>
      </td>
    </tr>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`bg-border animate-pulse inline-block ${className}`}
    />
  );
}

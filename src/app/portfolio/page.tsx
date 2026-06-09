import { Container } from "@/components/ui";
import {
  AllocationDonut,
  LiveBalances,
  PolymarketBets,
  PortfolioChart,
} from "@/components/blocks";
import { RANGES, getPortfolioSeries } from "@/lib/portfolio";
import { getLiveBalances } from "@/lib/balances";

export default async function PortfolioPage() {
  const [series, balances] = await Promise.all([
    getPortfolioSeries(),
    getLiveBalances(),
  ]);

  return (
    <div className="pb-4 sm:pb-8 md:pb-12 space-y-4 sm:space-y-6 md:space-y-8">
      <PortfolioChart series={series} ranges={RANGES} defaultRange="3M" />

      <Container className="px-3 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 items-stretch">
          <AllocationDonut initial={balances} />
          <LiveBalances initial={balances} />
        </div>
      </Container>

      <PolymarketBets initial={balances} />
    </div>
  );
}

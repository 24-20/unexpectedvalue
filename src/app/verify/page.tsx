import { Container, Mono } from "@/components/ui";
import { PolymarketIcon, SolanaIcon } from "@/components/icons";
import { getLiveBalances, type LiveBalances } from "@/lib/balances";
import { formatNOK } from "@/lib/format";

interface VerifyMetric {
  label: string;
  value: number | null;
}

interface VerifyLink {
  network: string;
  label: string;
  href: string;
  explorer: string;
  address: string;
  icon: React.ReactNode;
  metrics: VerifyMetric[];
}

function buildLinks(b: LiveBalances): VerifyLink[] {
  return [
    {
      network: "Solana",
      label: "Phantom wallet",
      href: `https://solscan.io/account/${b.cash.phantom.address}`,
      explorer: "Open on Solscan",
      address: b.cash.phantom.address,
      icon: <SolanaIcon className="w-8 h-8" />,
      metrics: [{ label: "Cash", value: b.cash.phantom.nok }],
    },
    {
      network: "Polygon",
      label: "Polymarket account",
      href: `https://polymarket.com/profile/${b.polymarketBets.address}`,
      explorer: "Open on Polymarket",
      address: b.polymarketBets.address,
      icon: <PolymarketIcon className="w-8 h-8" />,
      metrics: [
        { label: "Live bets", value: b.polymarketBets.valueNok },
        { label: "Resting cash", value: b.cash.polymarketCash.nok },
      ],
    },
  ];
}

function shortAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default async function VerifyPage() {
  const balances = await getLiveBalances();
  const links = buildLinks(balances);

  return (
    <div className="flex-1">
      <Container className="py-12 md:py-20 px-6 sm:px-10 md:px-16">
        <div className="max-w-2xl">
          <p className="text-base sm:text-lg text-muted max-w-xl leading-relaxed">
            The dashboard reads live from the two wallets below. Every transaction and bet is
            on-chain. Public, permanent, and verifiable by anyone.
          </p>
        </div>

        <ul className="mt-10 md:mt-14 grid gap-3 sm:gap-4 sm:grid-cols-2 max-w-3xl">
          {links.map((l) => (
            <li key={l.network}>
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group block h-full border border-border bg-surface p-5 sm:p-6 transition-all hover:border-foreground/40 hover:bg-surface-elevated hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-foreground/[0.04] border border-border flex items-center justify-center shrink-0">
                    {l.icon}
                  </span>
                  <div className="min-w-0">
                    <Mono className="text-muted">{l.network}</Mono>
                    <div className="text-lg sm:text-xl font-medium tracking-tight truncate mt-0.5">
                      {l.label}
                    </div>
                  </div>
                </div>

                <dl className="mt-5 space-y-1.5 font-mono text-xs sm:text-sm tabular-nums">
                  {l.metrics.map((m) => (
                    <div
                      key={m.label}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <dt className="text-muted">{m.label}</dt>
                      <dd>{m.value != null ? formatNOK(m.value) : "—"}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 pt-4 border-t border-border flex items-center justify-between gap-3">
                  <span
                    className="font-mono text-[11px] text-muted-strong tabular-nums truncate"
                    title={l.address}
                  >
                    {shortAddress(l.address)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-foreground inline-flex items-center gap-1.5 transition-[gap] group-hover:gap-2.5">
                    {l.explorer}
                    <span aria-hidden className="leading-none">
                      ↗
                    </span>
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}

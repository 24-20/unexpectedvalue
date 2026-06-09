"use client";

import { Mono } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNOK, formatPct } from "@/lib/format";
import type { LiveBalances, PolymarketPosition } from "@/lib/balances";
import { usePolledBalances } from "@/lib/useBalances";

interface PolymarketBetsProps {
  initial: LiveBalances;
  pollMs?: number;
}

export function PolymarketBets({
  initial,
  pollMs = 10_000,
}: PolymarketBetsProps) {
  const { data } = usePolledBalances(initial, pollMs);

  const bets = data.polymarketBets;
  const usdNok = data.rates.usdNok;
  const positions = bets.positions ?? [];

  return (
    <div className="border-y border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface flex flex-col">
          <div className="p-6 border-b border-border flex items-end justify-between gap-4">
            <div>
              <Mono className="text-muted">Open bets · Polymarket</Mono>
              <div className="mt-2 text-2xl font-medium tracking-tight">
                {positions.length === 0
                  ? "No open positions"
                  : `${positions.length} market${positions.length === 1 ? "" : "s"}`}
              </div>
            </div>
            <div className="text-right">
              <Mono className="text-muted">Current value</Mono>
              <div className="mt-2 font-mono text-sm tabular-nums">
                {bets.valueNok != null ? formatNOK(bets.valueNok) : "—"}
              </div>
            </div>
          </div>

          {positions.length === 0 ? (
            <div className="p-10 text-center text-muted text-sm">
              No live bets at {shortAddr(bets.address)}. Place a bet on
              Polymarket and it will show up here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <Th className="text-left">Market</Th>
                    <Th className="text-left">Outcome</Th>
                    <Th className="text-right">Avg / Now</Th>
                    <Th className="text-right">Size</Th>
                    <Th className="text-right">P/L</Th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p, i) => (
                    <PositionRow
                      key={`${p.slug}-${p.outcome}-${i}`}
                      pos={p}
                      usdNok={usdNok}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PositionRow({
  pos,
  usdNok,
}: {
  pos: PolymarketPosition;
  usdNok: number | null;
}) {
  const up = pos.cashPnl >= 0;
  const sizeNok = usdNok != null ? pos.currentValue * usdNok : null;
  const pnlNok = usdNok != null ? pos.cashPnl * usdNok : null;
  const outcomeYes = pos.outcome.toLowerCase() === "yes";

  return (
    <tr className="border-b border-border last:border-b-0 hover:bg-foreground hover:text-background transition-colors">
      <td className="px-4 py-3 max-w-md">
        <div className="flex items-center gap-3">
          {pos.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pos.icon}
              alt=""
              className="w-8 h-8 border border-border shrink-0 object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium line-clamp-2 leading-tight">
              {pos.title}
            </div>
            {pos.endDate && (
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted mt-0.5">
                ends {formatEnd(pos.endDate)}
                {pos.redeemable ? " · redeemable" : ""}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest border border-border px-2 py-0.5 inline-block",
            outcomeYes
              ? "bg-foreground text-background"
              : "bg-background text-foreground",
          )}
        >
          {pos.outcome}
        </span>
      </td>
      <td className="font-mono text-xs tabular-nums text-right px-4 py-3 whitespace-nowrap">
        {pos.avgPrice.toFixed(2)} → {pos.curPrice.toFixed(2)}
      </td>
      <td className="font-mono text-xs tabular-nums text-right px-4 py-3 whitespace-nowrap">
        <div>{sizeNok != null ? formatNOK(sizeNok) : "—"}</div>
        <div className="text-muted text-[10px] mt-0.5">
          ${pos.currentValue.toFixed(2)}
        </div>
      </td>
      <td
        className={cn(
          "font-mono text-xs tabular-nums text-right px-4 py-3 whitespace-nowrap",
          up ? "text-up" : "text-down",
        )}
      >
        <div>
          {up ? "▲" : "▼"} {pnlNok != null ? formatNOK(Math.abs(pnlNok)) : "—"}
        </div>
        <div className="text-[10px] mt-0.5 opacity-80">
          {formatPct(pos.percentPnl, 1)}
        </div>
      </td>
    </tr>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "font-mono text-[10px] uppercase tracking-widest text-muted px-4 py-3",
        className,
      )}
    >
      {children}
    </th>
  );
}

function shortAddr(a: string) {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatEnd(iso: string) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

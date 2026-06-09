"use client";

import { formatNOK } from "@/lib/format";
import type { LiveBalances } from "@/lib/balances";
import { usePolledBalances } from "@/lib/useBalances";

interface HoldingsProps {
  initial: LiveBalances;
  pollMs?: number;
}

const SIZE = 80;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 38;
const R_IN = 24;

function polar(r: number, a: number) {
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
}

function donutSlice(r: number, ri: number, a0: number, a1: number) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0o, y0o] = polar(r, a0);
  const [x1o, y1o] = polar(r, a1);
  const [x0i, y0i] = polar(ri, a0);
  const [x1i, y1i] = polar(ri, a1);
  return [
    `M ${x0o.toFixed(2)} ${y0o.toFixed(2)}`,
    `A ${r} ${r} 0 ${large} 1 ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
    `L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
    `A ${ri} ${ri} 0 ${large} 0 ${x0i.toFixed(2)} ${y0i.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function Holdings({ initial, pollMs = 10_000 }: HoldingsProps) {
  const { data } = usePolledBalances(initial, pollMs);

  const cash = data.cash.totalNok ?? 0;
  const bets = data.polymarketBets.valueNok ?? 0;
  const total = cash + bets;

  let acc = -Math.PI / 2;
  const slices = [
    { value: cash, fill: "var(--foreground)" },
    { value: bets, fill: "var(--muted)" },
  ];

  const arcs = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const a0 = acc;
      const a1 = acc + (slice.value / total) * Math.PI * 2;
      acc = a1;
      return {
        d: donutSlice(R_OUT, R_IN, a0, a1),
        fill: slice.fill,
      };
    });

  return (
    <div className="py-4 sm:py-5 flex items-center gap-6 sm:gap-8">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-24 sm:w-28 md:w-32 h-auto shrink-0"
        aria-label="Holdings allocation"
      >
        {arcs.length === 0 ? (
          <circle
            cx={CX}
            cy={CY}
            r={(R_OUT + R_IN) / 2}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={R_OUT - R_IN}
            strokeDasharray="3 3"
          />
        ) : (
          arcs.map((arc, i) => (
            <path
              key={i}
              d={arc.d}
              fill={arc.fill}
              stroke="var(--background)"
              strokeWidth="1.5"
              strokeLinejoin="miter"
            />
          ))
        )}
      </svg>

      <div className="flex-1 min-w-0">
        <div className="space-y-1.5 font-mono text-xs sm:text-sm tabular-nums">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 bg-foreground shrink-0"
            />
            <span className="text-muted">Cash in wallets</span>
            <span>{formatNOK(cash)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-block w-2.5 h-2.5 bg-muted shrink-0"
            />
            <span className="text-muted">Open bets</span>
            <span>{formatNOK(bets)}</span>
          </div>
        </div>
      </div>

    </div>
  );
}

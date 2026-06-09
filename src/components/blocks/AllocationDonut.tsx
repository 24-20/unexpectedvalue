"use client";

import { Mono } from "@/components/ui";
import { formatNOK } from "@/lib/format";
import type { LiveBalances } from "@/lib/balances";
import { usePolledBalances } from "@/lib/useBalances";

interface AllocationDonutProps {
  initial: LiveBalances;
  pollMs?: number;
  title?: string;
}

interface Slice {
  label: string;
  value: number;
  pct: number;
  patternId: string;
}

const SIZE = 320;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUT = 140;
const R_IN = 86;

const PATTERNS: { id: string; el: React.ReactElement }[] = [
  {
    id: "pie-pat-0",
    el: <rect width="100%" height="100%" fill="var(--foreground)" />,
  },
  {
    id: "pie-pat-1",
    el: (
      <>
        <rect width="100%" height="100%" fill="var(--background)" />
        <path
          d="M-2,4 l8,-8 M0,12 l12,-12 M8,12 l8,-8"
          stroke="var(--foreground)"
          strokeWidth="2"
        />
      </>
    ),
  },
  {
    id: "pie-pat-2",
    el: (
      <>
        <rect width="100%" height="100%" fill="var(--background)" />
        <path
          d="M-2,4 l8,-8 M0,12 l12,-12 M8,12 l8,-8 M-2,8 l-8,8 M0,0 l-12,12 M8,0 l-12,12"
          stroke="var(--foreground)"
          strokeWidth="1.5"
        />
      </>
    ),
  },
];

function polar(r: number, angle: number) {
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)] as const;
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

export function AllocationDonut({
  initial,
  pollMs = 10_000,
  title = "Allocation",
}: AllocationDonutProps) {
  const { data } = usePolledBalances(initial, pollMs);

  const cashNok = data.cash.totalNok ?? 0;
  const betsNok = data.polymarketBets.valueNok ?? 0;
  const total = cashNok + betsNok;

  const raw = [
    { label: "Cash", value: cashNok, patternId: PATTERNS[1].id },
    { label: "Open bets", value: betsNok, patternId: PATTERNS[0].id },
  ];
  const slices: Slice[] = raw.map((s) => ({
    ...s,
    pct: total > 0 ? (s.value / total) * 100 : 0,
  }));

  let acc = -Math.PI / 2;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const a0 = acc;
      const a1 = acc + (slice.value / total) * Math.PI * 2;
      acc = a1;
      return {
        d: donutSlice(R_OUT, R_IN, a0, a1),
        patternId: slice.patternId,
        slice,
      };
    });

  return (
    <div className="border border-border bg-surface flex flex-col h-full">
      <div className="p-6 border-b border-border flex items-end justify-between">
        <div>
          <Mono className="text-muted">{title}</Mono>
          <div className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
            {formatNOK(total)}
          </div>
        </div>
        <Mono className="text-muted">Cash · Bets</Mono>
      </div>

      <div className="p-6 flex-1 flex flex-col md:flex-row items-center gap-6">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-[260px] h-[260px] shrink-0"
          aria-label="Allocation donut chart"
        >
          <defs>
            {PATTERNS.map((p) => (
              <pattern
                key={p.id}
                id={p.id}
                width="12"
                height="12"
                patternUnits="userSpaceOnUse"
              >
                {p.el}
              </pattern>
            ))}
          </defs>
          {arcs.length === 0 ? (
            <circle
              cx={CX}
              cy={CY}
              r={(R_OUT + R_IN) / 2}
              fill="none"
              stroke="var(--border-strong)"
              strokeWidth={R_OUT - R_IN}
              strokeDasharray="6 6"
            />
          ) : (
            arcs.map((arc, i) => (
              <path
                key={i}
                d={arc.d}
                fill={`url(#${arc.patternId})`}
                stroke="var(--surface)"
                strokeWidth="2"
                strokeLinejoin="miter"
              />
            ))
          )}
          <circle
            cx={CX}
            cy={CY}
            r={R_OUT + 0.5}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <circle
            cx={CX}
            cy={CY}
            r={R_IN - 0.5}
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
        </svg>

        <ul className="flex-1 w-full divide-y divide-border">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-3 py-2 px-1">
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                className="w-5 h-5 border border-border shrink-0 block"
              >
                <rect width="12" height="12" fill={`url(#${s.patternId})`} />
              </svg>
              <span className="flex-1 text-sm leading-tight">{s.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-strong">
                {formatNOK(s.value)}
              </span>
              <span className="font-mono text-xs tabular-nums text-muted w-12 text-right">
                {s.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

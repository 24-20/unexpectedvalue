"use client";

import { Mono } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatNOK } from "@/lib/format";
import type { LiveBalances as LiveBalancesData } from "@/lib/balances";
import { usePolledBalances } from "@/lib/useBalances";

interface LiveBalancesProps {
  initial: LiveBalancesData;
  pollMs?: number;
}

export function LiveBalances({ initial, pollMs = 10_000 }: LiveBalancesProps) {
  const { data, stale, elapsedSec } = usePolledBalances(initial, pollMs);
  const cash = data.cash;

  return (
    <div className="border border-border bg-surface">
      <div className="p-6 border-b border-border flex items-end justify-between gap-4">
        <div>
          <Mono className="text-muted">Cash</Mono>
          <div className="mt-2 text-2xl font-medium tracking-tight tabular-nums">
            {cash.totalNok != null ? formatNOK(cash.totalNok) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <span
              className={cn(
                "inline-block w-2 h-2 rounded-full",
                stale ? "bg-down" : "bg-up",
              )}
              aria-hidden
            />
            <Mono className="text-muted">last fetched</Mono>
          </div>
          <div className="mt-2 font-mono text-xs tabular-nums text-muted-strong">
            {formatClock(data.fetchedAt)}
            <span className="text-muted"> · {elapsedSec}s ago</span>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-border">
        <Row
          label="Polymarket"
          sublabel="Wallet (USDC)"
          nok={cash.polymarketCash.nok}
          native={
            cash.polymarketCash.usdc != null
              ? `$${cash.polymarketCash.usdc.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })} USDC`
              : null
          }
          addr={cash.polymarketCash.address}
        />
        <Row
          label="Phantom"
          sublabel="Solana wallet"
          nok={cash.phantom.nok}
          native={formatPhantomNative(cash.phantom.sol, cash.phantom.stableUsd)}
          addr={cash.phantom.address}
        />
      </ul>
    </div>
  );
}

function Row({
  label,
  sublabel,
  nok,
  native,
  addr,
}: {
  label: string;
  sublabel: string;
  nok: number | null;
  native: string | null;
  addr: string;
}) {
  return (
    <li className="flex items-baseline gap-4 px-6 py-4">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {sublabel} · {shortAddr(addr)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-sm tabular-nums">
          {nok != null ? formatNOK(nok) : "—"}
        </div>
        {native && (
          <div className="font-mono text-[10px] tabular-nums text-muted mt-0.5">
            {native}
          </div>
        )}
      </div>
    </li>
  );
}

function shortAddr(a: string) {
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatPhantomNative(
  sol: number | null,
  stableUsd: number | null,
): string | null {
  const parts: string[] = [];
  if (sol != null) {
    parts.push(
      `${sol.toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      })} SOL`,
    );
  }
  if (stableUsd != null && stableUsd > 0) {
    parts.push(
      `$${stableUsd.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} USDC`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatClock(t: number) {
  return new Date(t).toLocaleTimeString("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

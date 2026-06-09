"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatNOK, formatPct } from "@/lib/format";
import type {
  ActivityEvent,
  LiveBalances,
  PolymarketPosition,
} from "@/lib/balances";
import { usePolledBalances } from "@/lib/useBalances";

interface PolymarketBetsProps {
  initial: LiveBalances;
  pollMs?: number;
}

type Tab = "active" | "history";
type SortMode = "recent" | "amount";
type HistorySortMode = "recent" | "biggest_win" | "biggest_loss";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "amount", label: "Highest amount" },
];

const HISTORY_SORT_OPTIONS: { value: HistorySortMode; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "biggest_win", label: "Biggest win" },
  { value: "biggest_loss", label: "Biggest loss" },
];

export function PolymarketBets({
  initial,
  pollMs = 10_000,
}: PolymarketBetsProps) {
  const { data } = usePolledBalances(initial, pollMs);
  const [tab, setTab] = useState<Tab>("active");
  const [sort, setSort] = useState<SortMode>("recent");
  const [historySort, setHistorySort] = useState<HistorySortMode>("recent");

  const usdNok = data.rates.usdNok;
  const positions = (data.polymarketBets.positions ?? []).filter(
    (p) => p.status === "open",
  );
  const activity = data.polymarketBets.activity ?? [];

  const positionRecency = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activity) {
      if (!a.slug || !a.outcome) continue;
      const key = `${a.slug}-${a.outcome}`;
      const existing = map.get(key) ?? 0;
      if (a.timestamp > existing) map.set(key, a.timestamp);
    }
    return map;
  }, [activity]);

  const sortedPositions = useMemo(() => {
    const sorted = [...positions];
    if (sort === "amount") {
      sorted.sort((a, b) => b.currentValue - a.currentValue);
    } else {
      sorted.sort((a, b) => {
        const ka = `${a.slug}-${a.outcome}`;
        const kb = `${b.slug}-${b.outcome}`;
        const ta = positionRecency.get(ka) ?? 0;
        const tb = positionRecency.get(kb) ?? 0;
        return tb - ta;
      });
    }
    return sorted;
  }, [positions, sort, positionRecency]);

  const sortedActivity = useMemo(() => {
    const sorted = [...activity];
    if (historySort === "biggest_win") {
      sorted.sort((a, b) => signedValueUsd(b) - signedValueUsd(a));
    } else if (historySort === "biggest_loss") {
      sorted.sort((a, b) => signedValueUsd(a) - signedValueUsd(b));
    } else {
      sorted.sort((a, b) => b.timestamp - a.timestamp);
    }
    return sorted;
  }, [activity, historySort]);

  return (
    <div className="border-y border-border">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
        <div className="bg-surface">
          <div className="px-3 py-3 border-b border-border flex items-center gap-2">
            <div className="inline-flex items-center bg-foreground/[0.05] rounded-lg p-1 gap-0.5">
              <TabButton
                active={tab === "active"}
                onClick={() => setTab("active")}
              >
                Active bets
              </TabButton>
              <TabButton
                active={tab === "history"}
                onClick={() => setTab("history")}
              >
                History
              </TabButton>
            </div>
            <div className="ml-auto">
              {tab === "active" ? (
                <SortFilter
                  sort={sort}
                  options={SORT_OPTIONS}
                  onChange={setSort}
                />
              ) : (
                <SortFilter
                  sort={historySort}
                  options={HISTORY_SORT_OPTIONS}
                  onChange={setHistorySort}
                />
              )}
            </div>
          </div>

          {tab === "active" ? (
            <ActiveBetsTable positions={sortedPositions} usdNok={usdNok} />
          ) : (
            <HistoryTable events={sortedActivity} usdNok={usdNok} />
          )}
        </div>
      </div>
    </div>
  );
}

function SortFilter<V extends string>({
  sort,
  options,
  onChange,
}: {
  sort: V;
  options: { value: V; label: string }[];
  onChange: (s: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-mono text-[10px] uppercase tracking-widest rounded-lg bg-foreground/[0.05] text-muted px-3 py-2 hover:bg-foreground/10 hover:text-foreground flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
      >
        <span>Filter</span>
        <span
          aria-hidden
          className={cn(
            "transition-transform leading-none",
            open && "rotate-180",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 rounded-lg bg-surface-elevated min-w-[180px] z-20 overflow-hidden p-1"
        >
          {options.map((opt) => {
            const selected = opt.value === sort;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center justify-between gap-3 w-full text-left font-mono text-[10px] uppercase tracking-widest rounded-lg px-3 py-2 whitespace-nowrap cursor-pointer transition-colors",
                  selected
                    ? "text-foreground"
                    : "text-muted hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <span>{opt.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    "leading-none",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActiveBetsTable({
  positions,
  usdNok,
}: {
  positions: PolymarketPosition[];
  usdNok: number | null;
}) {
  if (positions.length === 0) {
    return (
      <div className="min-h-[200px] px-4 py-6 text-muted text-sm">
        No active bets
      </div>
    );
  }
  return (
    <div className="min-h-[200px]">
      <table className="w-full border-collapse">
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
  );
}

function HistoryTable({
  events,
  usdNok,
}: {
  events: ActivityEvent[];
  usdNok: number | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (events.length === 0) {
    return <div className="px-4 py-6 text-muted text-sm">No history yet</div>;
  }
  const now = Date.now();
  return (
    <table className="w-full border-collapse">
      <tbody>
        {events.map((e, i) => (
          <ActivityRow
            key={`${e.txHash ?? "row"}-${e.timestamp}-${i}`}
            event={e}
            now={now}
            usdNok={usdNok}
          />
        ))}
      </tbody>
    </table>
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
  const multiplier = formatMultiplier(pos.avgPrice);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 md:px-6 py-3 md:py-5 max-w-md">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <SourceIcon icon={pos.icon} source={pos.source} />
          <div className="min-w-0 flex-1">
            <div className="text-base md:text-lg line-clamp-1 leading-tight">
              {pos.title}
            </div>
            {pos.source !== "polymarket" && (
              <div className="font-mono text-xs md:text-sm uppercase tracking-widest text-muted mt-0.5">
                {pos.source}
              </div>
            )}
            <div className="font-mono text-xs tabular-nums text-muted mt-1 sm:hidden">
              <span className="uppercase tracking-widest">{pos.outcome}</span>
              {multiplier && <> · {multiplier}</>}
              {sizeNok != null && <> · {formatNOK(sizeNok)}</>}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 md:px-6 py-3 md:py-5 hidden sm:table-cell">
        <div className="flex items-center gap-2 md:gap-3">
          <span
            className={cn(
              "font-mono text-[10px] md:text-xs uppercase tracking-widest border border-border px-2 md:px-2.5 py-0.5 md:py-1 inline-block",
              outcomeYes
                ? "bg-foreground text-background"
                : "bg-background text-foreground",
            )}
          >
            {pos.outcome}
          </span>
          {multiplier && (
            <span className="font-mono text-[10px] md:text-xs uppercase tracking-widest text-muted-strong tabular-nums">
              {multiplier}
            </span>
          )}
        </div>
      </td>
      <td className="font-mono text-xs md:text-sm tabular-nums text-right px-4 md:px-6 py-3 md:py-5 whitespace-nowrap hidden md:table-cell">
        {sizeNok != null ? formatNOK(sizeNok) : "—"}
      </td>
      <td
        className={cn(
          "font-mono text-sm md:text-base tabular-nums text-right px-4 md:px-6 py-3 md:py-5 whitespace-nowrap",
          up ? "text-up" : "text-down",
        )}
      >
        <div>{pnlNok != null ? formatNOK(pnlNok) : "—"}</div>
        <div className="text-xs md:text-sm mt-0.5 opacity-80">
          {formatPct(pos.percentPnl, 1)}
        </div>
      </td>
    </tr>
  );
}

function ActivityRow({
  event,
  now,
  usdNok,
}: {
  event: ActivityEvent;
  now: number;
  usdNok: number | null;
}) {
  const signed = signedValueUsd(event);
  const positive = signed > 0;
  const negative = signed < 0;
  const valueNok = usdNok != null ? signed * usdNok : null;
  const action = describeAction(event);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-4 md:px-6 py-3 md:py-5 whitespace-nowrap">
        <div className="flex items-center gap-2 md:gap-3">
          <span
            className="hidden sm:flex w-6 h-6 md:w-8 md:h-8 border border-border items-center justify-center font-mono text-sm md:text-base leading-none shrink-0 text-foreground"
            aria-hidden
          >
            {action.symbol}
          </span>
          <span className="font-mono text-xs md:text-sm uppercase tracking-widest">
            {action.label}
          </span>
        </div>
      </td>
      <td className="px-4 md:px-6 py-3 md:py-5 max-w-md">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <SourceIcon icon={event.icon} source={event.source} />
          <div className="min-w-0 flex-1">
            <div className="text-base md:text-lg line-clamp-1 leading-tight">
              {event.title ?? action.label}
            </div>
            {event.source !== "polymarket" && (
              <div className="font-mono text-xs md:text-sm uppercase tracking-widest text-muted mt-0.5">
                {event.source}
              </div>
            )}
            {event.outcome && (
              <div className="mt-1.5 md:mt-2 flex items-center gap-2 md:gap-3">
                <span className="font-mono text-[10px] md:text-xs uppercase tracking-widest border border-border bg-surface-elevated text-muted-strong px-2 md:px-2.5 py-0.5 md:py-1 inline-block">
                  {event.outcome}
                  {event.price != null ? ` ${Math.round(event.price * 100)}¢` : ""}
                </span>
                {event.shares != null && (
                  <span className="font-mono text-xs md:text-sm tabular-nums text-muted">
                    {formatShares(event.shares)} shares
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
      <td
        className={cn(
          "font-mono text-sm md:text-base tabular-nums text-right px-4 md:px-6 py-3 md:py-5 whitespace-nowrap",
          positive ? "text-up" : negative ? "text-down" : "",
        )}
      >
        <div>{formatSignedUsd(signed)}</div>
        {valueNok != null && (
          <div className="text-xs md:text-sm mt-0.5 opacity-80">
            {formatNOK(valueNok)}
          </div>
        )}
      </td>
      <td className="font-mono text-xs md:text-sm tabular-nums text-right text-muted px-4 md:px-6 py-3 md:py-5 whitespace-nowrap hidden sm:table-cell">
        {relativeTime(event.timestamp, now)}
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
        "font-mono text-[10px] uppercase tracking-widest text-muted px-4 py-2",
        className,
      )}
    >
      {children}
    </th>
  );
}

function SourceIcon({
  icon,
  source,
}: {
  icon: string | null;
  source: string;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        className="w-7 h-7 md:w-10 md:h-10 border border-border shrink-0 object-cover"
      />
    );
  }
  const initial = source.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="w-7 h-7 md:w-10 md:h-10 border border-border bg-surface-elevated shrink-0 flex items-center justify-center font-mono text-xs md:text-sm font-medium"
    >
      {initial}
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "font-mono text-xs uppercase tracking-widest rounded-md px-3 py-1.5 transition-colors cursor-pointer",
        active
          ? "bg-foreground/20 text-foreground"
          : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function describeAction(event: ActivityEvent): { symbol: string; label: string } {
  if (event.type === "TRADE") {
    return event.side === "SELL"
      ? { symbol: "−", label: "Sell" }
      : { symbol: "+", label: "Buy" };
  }
  if (event.type === "DEPOSIT") return { symbol: "↓", label: "Deposit" };
  if (event.type === "WITHDRAWAL") return { symbol: "↑", label: "Withdraw" };
  if (event.type === "REDEEM") return { symbol: "↓", label: "Redeem" };
  if (event.type === "MERGE") return { symbol: "⊕", label: "Merge" };
  if (event.type === "SPLIT") return { symbol: "⊖", label: "Split" };
  if (event.type === "CONVERSION") return { symbol: "↔", label: "Convert" };
  if (event.type === "REWARD") return { symbol: "★", label: "Reward" };
  return { symbol: "·", label: "Other" };
}

function signedValueUsd(event: ActivityEvent): number {
  const amount = Math.abs(event.usdcSize);
  switch (event.type) {
    case "TRADE":
      return event.side === "BUY" ? -amount : amount;
    case "DEPOSIT":
    case "REDEEM":
    case "REWARD":
      return amount;
    case "WITHDRAWAL":
      return -amount;
    default:
      return 0;
  }
}

function formatSignedUsd(n: number): string {
  if (n === 0) return "$0,00";
  const sign = n > 0 ? "+" : "−";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatShares(n: number): string {
  if (n >= 1000) return n.toFixed(0);
  return n.toFixed(n < 10 ? 2 : 1);
}

function formatMultiplier(price: number | null | undefined): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const mult = 1 / price;
  const rounded = Math.round(mult * 100) / 100;
  return `${rounded}x`;
}

function relativeTime(ms: number, now: number): string {
  if (!ms) return "—";
  const diff = Math.max(0, now - ms);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

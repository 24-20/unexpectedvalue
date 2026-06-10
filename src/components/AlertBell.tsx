"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ActivityEvent, LiveBalances } from "@/lib/balances";
import type { RecentInvestment } from "@/lib/investors";
import { betHref } from "@/lib/betId";

const STORAGE_KEY = "alertsLastUpdated";
const POLL_MS = 30_000;

interface BetAlert {
  kind: "bet";
  id: string;
  timestamp: number;
  title: string;
  outcome: string | null;
  price: number | null;
  usdSize: number;
  slug: string | null;
  icon: string | null;
  source: string;
}

interface InvestmentAlert {
  kind: "investment";
  id: string;
  timestamp: number;
  name: string;
  isNewInvestor: boolean;
}

type AlertItem = BetAlert | InvestmentAlert;

function extractBetAlerts(
  activity: ActivityEvent[] | null | undefined,
  since: number,
): BetAlert[] {
  if (!activity) return [];
  return activity
    .filter((e) => e.type === "TRADE" && e.side === "BUY")
    .filter((e) => e.timestamp > since)
    .map<BetAlert>((e, i) => ({
      kind: "bet",
      id: `${e.txHash ?? "row"}-${e.timestamp}-${i}`,
      timestamp: e.timestamp,
      title: e.title ?? "New bet placed",
      outcome: e.outcome,
      price: e.price,
      usdSize: Math.abs(e.usdcSize),
      slug: e.slug,
      icon: e.icon,
      source: e.source,
    }));
}

function extractInvestmentAlerts(
  investments: RecentInvestment[] | null,
  since: number,
): InvestmentAlert[] {
  if (!investments) return [];
  return investments
    .filter((inv) => inv.timestamp > since)
    .map<InvestmentAlert>((inv) => ({
      kind: "investment",
      id: `inv-${inv.id}`,
      timestamp: inv.timestamp,
      name: inv.name,
      isNewInvestor: inv.isNewInvestor,
    }));
}

function collectAlerts(
  activity: ActivityEvent[] | null | undefined,
  investments: RecentInvestment[] | null,
  since: number,
): AlertItem[] {
  return [
    ...extractBetAlerts(activity, since),
    ...extractInvestmentAlerts(investments, since),
  ].sort((a, b) => b.timestamp - a.timestamp);
}

export function AlertBell() {
  const [open, setOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [snapshotLastUpdated, setSnapshotLastUpdated] = useState<number | null>(
    null,
  );
  const [hasInitialized, setHasInitialized] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [investments, setInvestments] = useState<RecentInvestment[] | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = Number(stored);
      if (Number.isFinite(n)) {
        setLastUpdated(n);
        setHasInitialized(true);
        return;
      }
    }
    // First visit: seed lastUpdated so past events aren't all flagged as new.
    const t = Date.now();
    localStorage.setItem(STORAGE_KEY, String(t));
    setLastUpdated(t);
    setHasInitialized(true);
  }, []);

  useEffect(() => {
    if (!hasInitialized) return;
    let cancelled = false;
    async function fetchActivity() {
      try {
        const res = await fetch("/api/balances", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as LiveBalances;
        if (cancelled) return;
        setActivity(data.polymarketBets.activity ?? null);
      } catch {
        // swallow — polling will retry
      }
    }
    async function fetchInvestments() {
      try {
        const res = await fetch("/api/investments", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          investments: RecentInvestment[] | null;
        };
        if (cancelled) return;
        setInvestments(data.investments ?? null);
      } catch {
        // swallow — polling will retry
      }
    }
    function poll() {
      fetchActivity();
      fetchInvestments();
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hasInitialized]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const newAlerts = useMemo(() => {
    if (lastUpdated == null) return [];
    return collectAlerts(activity, investments, lastUpdated);
  }, [activity, investments, lastUpdated]);

  const displayedAlerts = useMemo(() => {
    if (snapshotLastUpdated == null) return [];
    return collectAlerts(activity, investments, snapshotLastUpdated);
  }, [activity, investments, snapshotLastUpdated]);

  const hasNew = newAlerts.length > 0;

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

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Snapshot the current cutoff so the dropdown can keep showing the items
    // even after we bump lastUpdated to "now" (which clears the red dot).
    setSnapshotLastUpdated(lastUpdated);
    const t = Date.now();
    localStorage.setItem(STORAGE_KEY, String(t));
    setLastUpdated(t);
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={hasNew ? `Alerts, ${newAlerts.length} new` : "Alerts"}
        className="text-muted hover:text-foreground transition-colors cursor-pointer relative inline-flex items-center justify-center leading-none align-middle"
      >
        <BellIcon />
        {hasNew && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-down ring-2 ring-background"
          />
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-1.5rem)] rounded-lg bg-surface-elevated border border-border z-50 overflow-hidden"
          style={{
            animation: "dropdown-pop-in 120ms ease-out",
            transformOrigin: "top right",
          }}
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-strong">
              Alerts
            </span>
            {displayedAlerts.length > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted tabular-nums">
                {displayedAlerts.length} new
              </span>
            )}
          </div>
          {displayedAlerts.length === 0 ? (
            <div className="px-4 py-8 text-muted text-sm text-center">
              No new alerts
            </div>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {displayedAlerts.map((a) => (
                <li
                  key={a.id}
                  className="border-b border-border last:border-b-0"
                >
                  <AlertRow
                    item={a}
                    now={now}
                    onNavigate={() => setOpen(false)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-[18px] h-[18px] block"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function AlertRow({
  item,
  now,
  onNavigate,
}: {
  item: AlertItem;
  now: number;
  onNavigate: () => void;
}) {
  if (item.kind === "investment") {
    return (
      <Link href="/owners" onClick={onNavigate} className="block">
        <div className="flex items-start gap-3 px-4 py-3 hover:bg-foreground/[0.04] transition-colors">
          <SourceIcon icon={null} source={item.name} />
          <div className="flex-1 min-w-0">
            <div className="text-sm leading-snug line-clamp-2">{item.name}</div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest border border-border px-1.5 py-0.5 inline-block",
                  item.isNewInvestor
                    ? "bg-foreground text-background"
                    : "bg-background text-foreground",
                )}
              >
                {item.isNewInvestor ? "New investor" : "New investment"}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
              {relativeTime(item.timestamp, now)}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  const href =
    item.slug && item.outcome ? betHref(item.slug, item.outcome) : null;
  const outcomeYes = (item.outcome ?? "").toLowerCase() === "yes";

  const body = (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-foreground/[0.04] transition-colors">
      <SourceIcon icon={item.icon} source={item.source} />
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug line-clamp-2">{item.title}</div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {item.outcome && (
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-widest border border-border px-1.5 py-0.5 inline-block",
                outcomeYes
                  ? "bg-foreground text-background"
                  : "bg-background text-foreground",
              )}
            >
              {item.outcome}
              {item.price != null
                ? ` ${Math.round(item.price * 100)}¢`
                : ""}
            </span>
          )}
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-strong tabular-nums">
            ${item.usdSize.toFixed(2)}
          </span>
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
          {relativeTime(item.timestamp, now)}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} onClick={onNavigate} className="block">
        {body}
      </Link>
    );
  }
  return body;
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
        className="w-8 h-8 border border-border shrink-0 object-cover"
      />
    );
  }
  const initial = source.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="w-8 h-8 border border-border bg-surface shrink-0 flex items-center justify-center font-mono text-xs font-medium"
    >
      {initial}
    </span>
  );
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

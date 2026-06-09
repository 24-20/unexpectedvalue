import { notFound } from "next/navigation";
import { Mono } from "@/components/ui";
import {
  fetchPolymarketMarket,
  getLiveBalances,
} from "@/lib/balances";
import type {
  ActivityEvent,
  PolymarketMarketInfo,
  PolymarketPosition,
} from "@/lib/balances";
import { decodeBetId } from "@/lib/betId";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatDateTime,
  formatNOK,
  formatNOKDelta,
  formatPct,
} from "@/lib/format";

type Verdict = "open" | "pending" | "redeemable" | "won" | "lost" | "void";

interface BetSummary {
  slug: string;
  outcome: string;
  title: string;
  icon: string | null;
  source: string;
  position: PolymarketPosition | null;
  market: PolymarketMarketInfo | null;
  related: ActivityEvent[];
  bought: number;
  sold: number;
  redeemed: number;
  endsAt: number | null;
  verdict: Verdict;
}

function summarizeBet(
  slug: string,
  outcome: string,
  positions: PolymarketPosition[],
  activity: ActivityEvent[],
  market: PolymarketMarketInfo | null,
): BetSummary | null {
  const position =
    positions.find((p) => p.slug === slug && p.outcome === outcome) ?? null;
  const related = activity
    .filter((a) => a.slug === slug && a.outcome === outcome)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!position && related.length === 0 && !market) return null;

  let bought = 0;
  let sold = 0;
  let redeemed = 0;
  for (const a of related) {
    const v = Math.abs(a.usdcSize);
    if (a.type === "TRADE") {
      if (a.side === "BUY") bought += v;
      else if (a.side === "SELL") sold += v;
    } else if (a.type === "REDEEM" || a.type === "REWARD") {
      redeemed += v;
    }
  }

  const latest = related[0];
  const endsAtStr = position?.endDate ?? market?.endDate ?? null;
  const endsAtParsed = endsAtStr ? Date.parse(endsAtStr) : NaN;
  const endsAt = Number.isFinite(endsAtParsed) ? endsAtParsed : null;

  let verdict: Verdict;
  if (position?.redeemable) {
    verdict = "redeemable";
  } else if (market?.closed && market.winningOutcome) {
    verdict =
      market.winningOutcome.toLowerCase() === outcome.toLowerCase()
        ? "won"
        : "lost";
  } else if (related.some((a) => a.type === "REDEEM")) {
    verdict = "won";
  } else if (!position && related.length > 0) {
    // Activity exists but position is gone — most likely a losing resolved bet.
    verdict = "lost";
  } else if (position?.source === "polymarket") {
    verdict = "open";
  } else {
    verdict = "pending";
  }

  return {
    slug,
    outcome,
    title: position?.title ?? market?.question ?? latest?.title ?? slug,
    icon: position?.icon ?? market?.icon ?? market?.image ?? latest?.icon ?? null,
    source: position?.source ?? latest?.source ?? "polymarket",
    position,
    market,
    related,
    bought,
    sold,
    redeemed,
    endsAt,
    verdict,
  };
}

export default async function BetDetailPage(
  props: PageProps<"/bets/[betId]">,
) {
  const { betId } = await props.params;
  const parsed = decodeBetId(betId);
  if (!parsed) notFound();

  const [balances, market] = await Promise.all([
    getLiveBalances(),
    fetchPolymarketMarket(parsed.slug),
  ]);

  const positions = balances.polymarketBets.positions ?? [];
  const activity = balances.polymarketBets.activity ?? [];

  const bet = summarizeBet(
    parsed.slug,
    parsed.outcome,
    positions,
    activity,
    market,
  );
  if (!bet) notFound();

  return <BetDetail bet={bet} usdNok={balances.rates.usdNok} />;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  open: "Open",
  pending: "Pending",
  redeemable: "Redeemable",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

function verdictTone(v: Verdict): "muted" | "up" | "down" {
  if (v === "won" || v === "redeemable") return "up";
  if (v === "lost") return "down";
  return "muted";
}

function BetDetail({
  bet,
  usdNok,
}: {
  bet: BetSummary;
  usdNok: number | null;
}) {
  const pos = bet.position;
  const outcomeYes = bet.outcome.toLowerCase() === "yes";
  const tone = verdictTone(bet.verdict);

  const avgPrice = pos?.avgPrice ?? 0;
  const stakeUsd = pos?.initialValue ?? Math.max(0, bet.bought - bet.sold);
  const currentUsd = pos?.currentValue ?? 0;
  const potentialUsd =
    pos && avgPrice > 0 ? pos.initialValue / avgPrice : pos?.size ?? 0;

  const stakeNok = usdNok != null ? stakeUsd * usdNok : null;
  const potentialNok = usdNok != null ? potentialUsd * usdNok : null;

  let pnlUsd: number;
  if (pos) {
    pnlUsd = pos.cashPnl;
  } else if (bet.verdict === "won") {
    pnlUsd = bet.redeemed + bet.sold - bet.bought;
  } else if (bet.verdict === "lost") {
    pnlUsd = bet.sold - bet.bought;
  } else {
    pnlUsd = bet.redeemed + bet.sold - bet.bought;
  }
  const pnlNok = usdNok != null ? pnlUsd * usdNok : null;
  const pnlPct = pos
    ? pos.percentPnl
    : stakeUsd > 0
      ? (pnlUsd / stakeUsd) * 100
      : 0;
  const pnlUp = pnlUsd >= 0;

  const multiplier = formatMultiplier(avgPrice);
  const winningOutcome = bet.market?.winningOutcome ?? null;

  return (
    <div>
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
          <div className="bg-surface">
            <div className="p-5 sm:p-8 md:p-10">
              <div className="flex flex-col sm:flex-row gap-5 sm:gap-7 md:gap-9">
                <BetIcon icon={bet.icon} source={bet.source} />

                <div className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill verdict={bet.verdict} />
                    <span
                      className={cn(
                        "font-mono text-[10px] md:text-xs uppercase tracking-widest border border-border px-2 md:px-2.5 py-0.5 md:py-1",
                        outcomeYes
                          ? "bg-foreground text-background"
                          : "bg-background text-foreground",
                      )}
                    >
                      {bet.outcome}
                    </span>
                    {multiplier && (
                      <Mono className="text-muted-strong tabular-nums">
                        {multiplier}
                      </Mono>
                    )}
                    <Mono className="text-muted">{bet.source}</Mono>
                  </div>

                  <h1 className="text-2xl sm:text-3xl md:text-5xl font-medium tracking-tight leading-[1.1]">
                    {bet.title}
                  </h1>

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-[11px] sm:text-xs tabular-nums">
                    {bet.endsAt != null && (
                      <span className="text-muted">
                        <span className="uppercase tracking-widest">
                          {bet.market?.closed ? "Resolved" : "Resolves"}
                        </span>{" "}
                        <span className="text-muted-strong">
                          {formatDate(bet.endsAt)}
                        </span>
                        {!bet.market?.closed && Date.now() < bet.endsAt && (
                          <>
                            {" · "}
                            {formatDuration(bet.endsAt - Date.now())} left
                          </>
                        )}
                      </span>
                    )}
                    {winningOutcome && (
                      <span className="text-muted">
                        <span className="uppercase tracking-widest">
                          Winner
                        </span>{" "}
                        <span
                          className={cn(
                            "text-muted-strong",
                            tone === "up" && "text-up",
                            tone === "down" && "text-down",
                          )}
                        >
                          {winningOutcome}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border px-5 sm:px-8 md:px-10 py-5 sm:py-6 md:py-7">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-7 md:gap-10">
                <Stat
                  label="Position"
                  primary={stakeNok != null ? formatNOK(stakeNok) : "—"}
                  secondary={`$${stakeUsd.toFixed(2)}`}
                />
                <Stat
                  label="Potential payout"
                  primary={
                    potentialNok != null && potentialUsd > 0
                      ? formatNOK(potentialNok)
                      : "—"
                  }
                  secondary={
                    potentialUsd > 0 ? `$${potentialUsd.toFixed(2)}` : null
                  }
                />
                <Stat
                  label="Multiplier"
                  primary={multiplier ?? "—"}
                  secondary={
                    avgPrice > 0 ? `${Math.round(avgPrice * 100)}¢ entry` : null
                  }
                />
                <Stat
                  label="PnL"
                  primary={pnlNok != null ? formatNOKDelta(pnlNok) : "—"}
                  secondary={formatPct(pnlPct, 1)}
                  tone={pnlUp ? "up" : "down"}
                />
              </div>

              {pos && (
                <div className="mt-5 sm:mt-7 md:mt-9 grid grid-cols-2 md:grid-cols-4 gap-5 sm:gap-7 md:gap-10">
                  <Stat
                    label="Current value"
                    primary={
                      usdNok != null ? formatNOK(currentUsd * usdNok) : "—"
                    }
                    secondary={`$${currentUsd.toFixed(2)}`}
                  />
                  <Stat
                    label="Shares"
                    primary={formatShares(pos.size)}
                    secondary={`avg ${Math.round(pos.avgPrice * 100)}¢`}
                  />
                  <Stat
                    label="Market price"
                    primary={`${Math.round(pos.curPrice * 100)}¢`}
                    secondary={`${(pos.curPrice * 100).toFixed(1)}% implied`}
                  />
                  <Stat
                    label={bet.endsAt != null ? "Resolves" : "Status"}
                    primary={
                      bet.endsAt != null
                        ? formatDate(bet.endsAt)
                        : VERDICT_LABEL[bet.verdict]
                    }
                    secondary={
                      bet.endsAt != null
                        ? VERDICT_LABEL[bet.verdict]
                        : null
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 md:px-10">
          <div className="bg-surface">
            <div className="px-5 sm:px-8 md:px-10 py-3 border-b border-border">
              <Mono className="text-muted">Bet history</Mono>
            </div>
            <BetActivityTable events={bet.related} usdNok={usdNok} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ verdict }: { verdict: Verdict }) {
  const tone = verdictTone(verdict);
  return (
    <span
      className={cn(
        "rounded-lg font-mono text-[10px] md:text-xs uppercase tracking-widest px-2.5 py-1",
        tone === "up" && "bg-up/15 text-up",
        tone === "down" && "bg-down/15 text-down",
        tone === "muted" && "bg-foreground/[0.08] text-muted-strong",
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function BetIcon({
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
        className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 border border-border shrink-0 object-cover"
      />
    );
  }
  const initial = source.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 border border-border bg-surface-elevated shrink-0 flex items-center justify-center font-mono text-2xl md:text-4xl font-medium"
    >
      {initial}
    </span>
  );
}

function Stat({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: string;
  secondary: string | null;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:gap-2 min-w-0">
      <Mono className="text-muted">{label}</Mono>
      <div
        className={cn(
          "font-medium text-lg sm:text-xl md:text-2xl tabular-nums leading-tight",
          tone === "up" && "text-up",
          tone === "down" && "text-down",
        )}
      >
        {primary}
      </div>
      {secondary && (
        <div className="font-mono text-[10px] md:text-xs tabular-nums text-muted">
          {secondary}
        </div>
      )}
    </div>
  );
}

function BetActivityTable({
  events,
  usdNok,
}: {
  events: ActivityEvent[];
  usdNok: number | null;
}) {
  if (events.length === 0) {
    return (
      <div className="px-5 sm:px-8 md:px-10 py-8 text-muted text-sm font-mono uppercase tracking-widest">
        No activity recorded
      </div>
    );
  }

  return (
    <table className="w-full border-collapse">
      <tbody>
        {events.map((e, i) => (
          <BetActivityRow
            key={`${e.txHash ?? "row"}-${e.timestamp}-${i}`}
            event={e}
            usdNok={usdNok}
          />
        ))}
      </tbody>
    </table>
  );
}

function BetActivityRow({
  event,
  usdNok,
}: {
  event: ActivityEvent;
  usdNok: number | null;
}) {
  const signed = signedValueUsd(event);
  const positive = signed > 0;
  const negative = signed < 0;
  const valueNok = usdNok != null ? signed * usdNok : null;
  const action = describeAction(event);

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="px-5 sm:px-8 md:px-10 py-3 md:py-4 whitespace-nowrap">
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
      <td className="px-4 md:px-6 py-3 md:py-4">
        <div className="font-mono text-xs md:text-sm tabular-nums text-muted">
          {event.timestamp ? formatDateTime(event.timestamp) : "—"}
        </div>
        {event.price != null && event.shares != null && (
          <div className="font-mono text-[10px] md:text-xs uppercase tracking-widest text-muted mt-1">
            {formatShares(event.shares)} shares @ {Math.round(event.price * 100)}¢
          </div>
        )}
      </td>
      <td
        className={cn(
          "font-mono text-sm md:text-base tabular-nums text-right px-5 sm:px-8 md:px-10 py-3 md:py-4 whitespace-nowrap",
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
    </tr>
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
  if (n === 0) return "$0.00";
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

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  if (d >= 1) return `${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}

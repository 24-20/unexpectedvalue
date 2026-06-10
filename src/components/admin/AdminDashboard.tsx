"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Mono } from "@/components/ui";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatNOK } from "@/lib/format";
import type { Investor } from "@/lib/investors";
import type { PendingBookieBet } from "@/lib/customBets";

interface Props {
  investors: Investor[];
  bookieBets: PendingBookieBet[];
}

interface SettleTarget {
  bet: PendingBookieBet;
  status: "won" | "lost";
}

interface SearchState {
  searching: boolean;
  searched: boolean;
  match: Investor | null;
}

const INITIAL_SEARCH: SearchState = {
  searching: false,
  searched: false,
  match: null,
};

function parseDecimal(s: string): number {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function AdminDashboard({ investors, bookieBets }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [search, setSearch] = useState<SearchState>(INITIAL_SEARCH);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [equityPreview, setEquityPreview] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [betBookie, setBetBookie] = useState("");
  const [betTitle, setBetTitle] = useState("");
  const [betOutcome, setBetOutcome] = useState("");
  const [betStakeStr, setBetStakeStr] = useState("");
  const [betOddsStr, setBetOddsStr] = useState("");
  const [betEndsAt, setBetEndsAt] = useState("");
  const [creatingBet, setCreatingBet] = useState(false);
  const [createBetError, setCreateBetError] = useState<string | null>(null);

  // Debounced live search
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSearch(INITIAL_SEARCH);
      return;
    }
    // Reset any prior match — otherwise the previous "Found: X" stays
    // visible against the now-different name until the debounce fires.
    setSearch({ searching: true, searched: false, match: null });
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/investors?name=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal },
        );
        const data = await res.json();
        setSearch({
          searching: false,
          searched: true,
          match: data.match ?? null,
        });
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        setSearch({ searching: false, searched: true, match: null });
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(id);
    };
  }, [name]);

  // Fetch equity for the dialog preview
  useEffect(() => {
    if (!dialogOpen) return;
    let cancelled = false;
    fetch("/api/balances")
      .then((r) => r.json())
      .then((b) => {
        if (cancelled) return;
        const cash = Number(b?.cash?.totalNok ?? 0);
        const bets = Number(b?.polymarketBets?.valueNok ?? 0);
        setEquityPreview(cash + bets);
      })
      .catch(() => {
        if (!cancelled) setEquityPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [dialogOpen]);

  const amount = useMemo(() => {
    const cleaned = amountStr.replace(/[\s,]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }, [amountStr]);

  const showAmountInput =
    search.match !== null || (search.searched && name.trim().length > 0);
  const canConfirm = showAmountInput && amount > 0;
  const isExisting = search.match !== null;
  const amountLabel = isExisting ? "Investment more (NOK)" : "New investor amount (NOK)";
  const ctaLabel = isExisting ? "Invest more" : "Create investor";

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investorId: search.match?.id ?? null,
          newName: search.match ? null : name.trim(),
          amountNok: amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed");
        setSubmitting(false);
        return;
      }
      // Reset form
      setDialogOpen(false);
      setName("");
      setAmountStr("");
      setSearch(INITIAL_SEARCH);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  }

  async function confirmSettle() {
    if (!settleTarget) return;
    setSettling(true);
    setSettleError(null);
    try {
      const res = await fetch("/api/admin/custom-bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: settleTarget.bet.id,
          status: settleTarget.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettleError(data?.error ?? "Failed");
        setSettling(false);
        return;
      }
      setSettleTarget(null);
      setSettling(false);
      router.refresh();
    } catch {
      setSettleError("Network error");
      setSettling(false);
    }
  }

  const betStake = parseDecimal(betStakeStr);
  const betOdds = parseDecimal(betOddsStr);
  const betPayout = betStake > 0 && betOdds > 1 ? betStake * betOdds : null;
  const canCreateBet =
    betBookie.trim().length > 0 &&
    betTitle.trim().length > 0 &&
    betOutcome.trim().length > 0 &&
    betStake > 0 &&
    betOdds > 1;

  async function createBet() {
    setCreatingBet(true);
    setCreateBetError(null);
    try {
      const res = await fetch("/api/admin/custom-bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookie: betBookie.trim(),
          title: betTitle.trim(),
          outcome: betOutcome.trim(),
          stakeUsd: betStake,
          oddsDecimal: betOdds,
          endsAt: betEndsAt || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateBetError(data?.error ?? "Failed");
        setCreatingBet(false);
        return;
      }
      setBetBookie("");
      setBetTitle("");
      setBetOutcome("");
      setBetStakeStr("");
      setBetOddsStr("");
      setBetEndsAt("");
      setCreatingBet(false);
      router.refresh();
    } catch {
      setCreateBetError("Network error");
      setCreatingBet(false);
    }
  }

  return (
    <div className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-6 py-12 md:py-20">
        <Mono className="text-muted">[ Admin ]</Mono>
        <h1 className="mt-3 text-3xl sm:text-4xl font-medium tracking-tight">
          Record investment
        </h1>
        <p className="mt-3 text-sm text-muted max-w-lg leading-relaxed">
          Look up an existing investor by name or create a new one. The
          deposit is recorded against the live equity snapshotted at confirm.
        </p>

        <div className="mt-6 max-w-lg border border-border bg-foreground/[0.03] px-4 py-3">
          <Mono className="text-muted">[ Order matters ]</Mono>
          <ol className="mt-2 space-y-1 font-mono text-xs">
            <li>
              <span className="text-muted tabular-nums mr-2">1.</span>
              Confirm the investment here.
            </li>
            <li>
              <span className="text-muted tabular-nums mr-2">2.</span>
              Then deposit the same amount to the wallet.
            </li>
          </ol>
          <p className="mt-2.5 text-[11px] text-muted leading-relaxed">
            Depositing first will double-count the money and skew everyone&apos;s
            percentages.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <Field label="Investor name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aleksander"
              autoComplete="off"
              autoFocus
            />
            <SearchStatus name={name} state={search} />
          </Field>

          {showAmountInput && (
            <Field label={amountLabel}>
              <Input
                inputMode="numeric"
                value={amountStr}
                onChange={(e) =>
                  setAmountStr(e.target.value.replace(/[^\d]/g, ""))
                }
                placeholder="5000"
              />
            </Field>
          )}

          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => setDialogOpen(true)}
          >
            {ctaLabel}
          </Button>
        </div>

        {investors.length > 0 && (
          <div className="mt-14 border-t border-border pt-6">
            <Mono className="text-muted">[ Current ownership ]</Mono>
            <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-x-6 items-baseline font-mono text-[10px] uppercase tracking-widest text-muted border-t border-border pb-2 pt-3">
              <span>Investor</span>
              <span className="text-right">Invested</span>
              <span className="text-right">Share</span>
            </div>
            <ul className="grid grid-cols-[1fr_auto_auto] gap-x-6 divide-y divide-border border-t border-b border-border">
              {investors.map((i) => (
                <li
                  key={i.id}
                  className="col-span-3 grid grid-cols-subgrid items-baseline py-3"
                >
                  <span className="truncate">{i.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted text-right">
                    {formatNOK(i.totalInvestedNok)}
                  </span>
                  <span className="font-mono tabular-nums text-sm text-right">
                    {i.percentage.toFixed(2)}
                    <span className="text-muted">%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-14 border-t border-border pt-6">
          <Mono className="text-muted">[ New bookie bet ]</Mono>
          <div className="mt-4 max-w-lg space-y-5">
            <Field label="Title">
              <Input
                value={betTitle}
                onChange={(e) => setBetTitle(e.target.value)}
                placeholder="e.g. Arsenal win the Premier League 25/26"
                autoComplete="off"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Bookie">
                <Input
                  value={betBookie}
                  onChange={(e) => setBetBookie(e.target.value)}
                  placeholder="e.g. Roobet"
                  autoComplete="off"
                />
              </Field>
              <Field label="Outcome">
                <Input
                  value={betOutcome}
                  onChange={(e) => setBetOutcome(e.target.value)}
                  placeholder="e.g. Yes"
                  autoComplete="off"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label="Stake (USD)">
                <Input
                  inputMode="decimal"
                  value={betStakeStr}
                  onChange={(e) =>
                    setBetStakeStr(e.target.value.replace(/[^\d.,]/g, ""))
                  }
                  placeholder="50"
                />
              </Field>
              <Field label="Odds (decimal)">
                <Input
                  inputMode="decimal"
                  value={betOddsStr}
                  onChange={(e) =>
                    setBetOddsStr(e.target.value.replace(/[^\d.,]/g, ""))
                  }
                  placeholder="2.40"
                />
              </Field>
              <Field label="Ends (optional)">
                <Input
                  type="date"
                  value={betEndsAt}
                  onChange={(e) => setBetEndsAt(e.target.value)}
                />
              </Field>
            </div>

            <div className="min-h-[16px] font-mono text-xs text-muted tabular-nums">
              {betPayout != null && (
                <>
                  ${betStake.toFixed(2)} @ {betOdds}x → wins $
                  {betPayout.toFixed(2)}
                </>
              )}
            </div>

            {createBetError && (
              <p className="font-mono text-xs text-down">{createBetError}</p>
            )}

            <Button
              type="button"
              size="sm"
              disabled={!canCreateBet || creatingBet}
              onClick={() => void createBet()}
            >
              {creatingBet ? "Adding…" : "Add bet"}
            </Button>
          </div>
        </div>

        <div className="mt-14 border-t border-border pt-6">
          <Mono className="text-muted">[ Bookie bets — pending ]</Mono>
          {bookieBets.length === 0 ? (
            <p className="mt-4 font-mono text-xs text-muted">
              No pending bookie bets.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {bookieBets.map((b) => (
                <li
                  key={b.id}
                  className="py-3.5 flex flex-wrap items-center gap-x-4 gap-y-3"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm leading-snug">{b.title}</div>
                    <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted tabular-nums">
                      {b.bookie} · {b.outcome} · ${b.stakeUsd.toFixed(2)} @{" "}
                      {b.oddsDecimal}x → $
                      {(b.stakeUsd * b.oddsDecimal).toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-up"
                      onClick={() => {
                        setSettleError(null);
                        setSettleTarget({ bet: b, status: "won" });
                      }}
                    >
                      Won
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-down"
                      onClick={() => {
                        setSettleError(null);
                        setSettleTarget({ bet: b, status: "lost" });
                      }}
                    >
                      Lost
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm investment</AlertDialogTitle>
            <AlertDialogDescription>
              {isExisting ? (
                <>
                  Investing <strong>{formatNOK(amount)}</strong> more for{" "}
                  <strong>{search.match?.name}</strong>. All other investors&apos;
                  percentages will adjust automatically.
                </>
              ) : (
                <>
                  Creating <strong>{name.trim()}</strong> with{" "}
                  <strong>{formatNOK(amount)}</strong>. All existing
                  investors will be diluted accordingly.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <dl className="font-mono text-xs space-y-1.5 border-t border-border pt-4 tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted">Amount</dt>
              <dd>{formatNOK(amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Current equity</dt>
              <dd>
                {equityPreview != null ? formatNOK(equityPreview) : "…"}
              </dd>
            </div>
            {isExisting && search.match && (
              <div className="flex justify-between">
                <dt className="text-muted">{search.match.name} now</dt>
                <dd>{search.match.percentage.toFixed(2)}%</dd>
              </div>
            )}
          </dl>

          {error && (
            <p className="font-mono text-xs text-down">{error}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault();
                void confirm();
              }}
            >
              {submitting ? "Confirming…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={settleTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setSettleTarget(null);
            setSettleError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mark bet as {settleTarget?.status === "won" ? "won" : "lost"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {settleTarget?.status === "won" ? (
                <>
                  <strong>{settleTarget.bet.title}</strong> pays out{" "}
                  <strong>
                    $
                    {(
                      settleTarget.bet.stakeUsd * settleTarget.bet.oddsDecimal
                    ).toFixed(2)}
                  </strong>{" "}
                  (${settleTarget.bet.stakeUsd.toFixed(2)} ×{" "}
                  {settleTarget.bet.oddsDecimal}) and moves to history as a
                  win.
                </>
              ) : settleTarget ? (
                <>
                  <strong>{settleTarget.bet.title}</strong> — the{" "}
                  <strong>${settleTarget.bet.stakeUsd.toFixed(2)}</strong>{" "}
                  stake is written off and the bet moves to history as a
                  loss.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {settleError && (
            <p className="font-mono text-xs text-down">{settleError}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={settling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={settling}
              onClick={(e) => {
                e.preventDefault();
                void confirmSettle();
              }}
            >
              {settling ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block mb-2">
        <Mono className="text-muted">{label}</Mono>
      </label>
      {children}
    </div>
  );
}

function SearchStatus({
  name,
  state,
}: {
  name: string;
  state: SearchState;
}) {
  if (!name.trim()) {
    return <div className="mt-2 min-h-[20px]" />;
  }
  return (
    <div className="mt-2 min-h-[20px] font-mono text-xs">
      {state.searching && !state.searched && (
        <span className="text-muted">Searching…</span>
      )}
      {state.searched && state.match && (
        <span>
          Found:{" "}
          <span className="text-foreground">{state.match.name}</span>{" "}
          <span className="text-muted">at</span>{" "}
          <span className="tabular-nums">
            {state.match.percentage.toFixed(2)}%
          </span>
        </span>
      )}
      {state.searched && !state.match && (
        <span className="text-muted">
          No match — new investor will be created.
        </span>
      )}
    </div>
  );
}

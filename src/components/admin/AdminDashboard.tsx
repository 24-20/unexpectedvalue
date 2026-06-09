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

interface Props {
  investors: Investor[];
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

export function AdminDashboard({ investors }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [search, setSearch] = useState<SearchState>(INITIAL_SEARCH);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [equityPreview, setEquityPreview] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <ul className="mt-4 divide-y divide-border border-t border-b border-border">
              {investors.map((i) => (
                <li
                  key={i.id}
                  className="flex items-baseline justify-between py-3"
                >
                  <span className="truncate">{i.name}</span>
                  <span className="font-mono tabular-nums text-sm">
                    {i.percentage.toFixed(2)}
                    <span className="text-muted">%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
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

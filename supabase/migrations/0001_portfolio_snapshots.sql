-- Hourly portfolio snapshots. One row per top-of-hour capture.
-- Typed columns power the chart query (fast, columnar scan).
-- `raw` jsonb keeps the full getLiveBalances() payload for future per-bet history.

create table if not exists public.portfolio_snapshots (
  id              bigint generated always as identity primary key,
  captured_at     timestamptz not null default now(),
  hour_bucket     timestamptz not null,

  total_nok               numeric(18, 2),
  cash_nok                numeric(18, 2),
  polymarket_bets_nok     numeric(18, 2),
  polymarket_cash_nok     numeric(18, 2),
  phantom_nok             numeric(18, 2),
  polymarket_bets_usd     numeric(18, 2),
  polymarket_cash_usdc    numeric(18, 6),
  phantom_usd             numeric(18, 2),
  phantom_sol             numeric(20, 9),
  phantom_stable_usd      numeric(18, 6),
  usd_nok                 numeric(12, 6),
  sol_usd                 numeric(14, 4),

  raw             jsonb not null,
  inserted_at     timestamptz not null default now(),

  constraint portfolio_snapshots_hour_bucket_uniq unique (hour_bucket)
);

create index if not exists portfolio_snapshots_captured_at_idx
  on public.portfolio_snapshots (captured_at desc);

-- Reads happen server-side with the service role key; no anon/authenticated access needed.
alter table public.portfolio_snapshots enable row level security;

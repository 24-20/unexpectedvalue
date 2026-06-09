-- Manually-tracked bets from external bookies (Roobet, DraftKings, etc.).
-- These are read server-side and merged into the live positions + activity feed
-- alongside the on-chain Polymarket data. USD throughout; convert at render time.

create table if not exists public.custom_bets (
  id                  uuid primary key default gen_random_uuid(),

  -- where the bet lives
  bookie              text not null,
  market_url          text,

  -- what it's on
  title               text not null,
  outcome             text not null,
  icon_url            text,

  -- money (USD)
  stake_usd           numeric(12, 2) not null check (stake_usd >= 0),
  odds_decimal        numeric(8, 3)  not null check (odds_decimal > 0),

  -- timing
  placed_at           timestamptz not null default now(),
  ends_at             timestamptz,
  settled_at          timestamptz,

  -- result
  status              text not null default 'pending'
    check (status in ('pending','won','lost','void','cashed_out')),
  settled_amount_usd  numeric(12, 2),

  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists custom_bets_placed_at_idx
  on public.custom_bets (placed_at desc);

create index if not exists custom_bets_status_idx
  on public.custom_bets (status);

-- Reads happen server-side with the service role key; no anon/authenticated access.
alter table public.custom_bets enable row level security;

-- keep updated_at fresh on every edit
create or replace function public.set_custom_bets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists custom_bets_set_updated_at on public.custom_bets;
create trigger custom_bets_set_updated_at
  before update on public.custom_bets
  for each row
  execute function public.set_custom_bets_updated_at();

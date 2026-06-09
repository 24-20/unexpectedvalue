-- Investors are the ownership stakeholders of the portfolio.
-- current_percentage is the source of truth for ownership and is derived from
-- the current equity at deposit time — NOT from cumulative cost basis. This
-- means unrealized gains/losses accrue to existing investors proportionally
-- between deposits, and a new deposit dilutes against the live equity, not
-- against the total amount ever paid in.
--
-- total_invested_nok tracks cumulative deposit amount per investor for
-- reference only — never used to compute percentages.

create table if not exists public.investors (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null,
  current_percentage  numeric(12, 8) not null default 0
    check (current_percentage >= 0 and current_percentage <= 100),
  total_invested_nok  numeric(18, 2) not null default 0
    check (total_invested_nok >= 0),
  created_at          timestamptz not null default now(),

  constraint investors_slug_uniq unique (slug)
);

create index if not exists investors_current_percentage_idx
  on public.investors (current_percentage desc);

alter table public.investors enable row level security;

-- Immutable deposit log. One row per investment event. The equity snapshot
-- columns capture the state at confirmation time so we can audit the
-- percentage math after the fact.

create table if not exists public.investments (
  id                  bigint generated always as identity primary key,
  investor_id         uuid not null references public.investors(id) on delete restrict,
  amount_nok          numeric(18, 2) not null check (amount_nok > 0),
  equity_before_nok   numeric(18, 2) not null check (equity_before_nok >= 0),
  equity_after_nok    numeric(18, 2) not null check (equity_after_nok > 0),
  percentage_before   numeric(12, 8) not null check (percentage_before >= 0 and percentage_before <= 100),
  percentage_after    numeric(12, 8) not null check (percentage_after > 0  and percentage_after <= 100),
  created_at          timestamptz not null default now()
);

create index if not exists investments_investor_id_idx
  on public.investments (investor_id, created_at desc);

create index if not exists investments_created_at_idx
  on public.investments (created_at desc);

alter table public.investments enable row level security;

-- Atomic deposit: creates a new investor if needed, recomputes percentages
-- across all investors, inserts the audit log row, and asserts the
-- percentage sum stayed at 100. Wrapped in an advisory lock so concurrent
-- deposits serialize.
--
-- For each existing investor i:
--   value_before[i]  = current_pct[i] / 100 * equity_now
--   value_after[i]   = value_before[i] + (amount if i is depositor else 0)
--   new_equity       = equity_now + amount
--   new_pct[i]       = value_after[i] / new_equity * 100
--
-- The equity_now = 0 case (first-ever deposit) is rejected — handle that
-- one manually by inserting the first investor at 100%.

create or replace function public.record_investment(
  p_investor_id     uuid,
  p_new_name        text,
  p_new_slug        text,
  p_amount_nok      numeric,
  p_equity_now_nok  numeric
)
returns table (
  investor_id        uuid,
  new_percentage     numeric,
  new_equity_nok     numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_investor_id     uuid;
  v_old_percentage  numeric;
  v_new_equity      numeric;
  v_value_before    numeric;
  v_value_after     numeric;
  v_new_percentage  numeric;
  v_pct_sum         numeric;
begin
  if p_amount_nok is null or p_amount_nok <= 0 then
    raise exception 'amount must be positive (got %)', p_amount_nok;
  end if;
  if p_equity_now_nok is null or p_equity_now_nok <= 0 then
    raise exception 'equity_now must be positive — handle the first-ever deposit manually';
  end if;

  -- Serialize concurrent deposits so the equity snapshot stays consistent
  -- with the row state we read below.
  perform pg_advisory_xact_lock(hashtext('record_investment')::bigint);

  if p_investor_id is null then
    if p_new_name is null or p_new_slug is null then
      raise exception 'p_new_name and p_new_slug required when p_investor_id is null';
    end if;
    insert into public.investors (name, slug, current_percentage, total_invested_nok)
    values (p_new_name, p_new_slug, 0, 0)
    returning id into v_investor_id;
    v_old_percentage := 0;
  else
    select current_percentage into v_old_percentage
      from public.investors
      where id = p_investor_id
      for update;
    if not found then
      raise exception 'investor % not found', p_investor_id;
    end if;
    v_investor_id := p_investor_id;
  end if;

  v_new_equity     := p_equity_now_nok + p_amount_nok;
  v_value_before   := v_old_percentage / 100.0 * p_equity_now_nok;
  v_value_after    := v_value_before + p_amount_nok;
  v_new_percentage := v_value_after / v_new_equity * 100.0;

  -- Everyone else's NOK value is unchanged; only the denominator grew. Their
  -- new percentage is therefore old_pct * (equity_now / new_equity).
  update public.investors
    set current_percentage = current_percentage * p_equity_now_nok / v_new_equity
    where id <> v_investor_id;

  update public.investors
    set current_percentage = v_new_percentage,
        total_invested_nok = total_invested_nok + p_amount_nok
    where id = v_investor_id;

  select sum(current_percentage) into v_pct_sum from public.investors;
  if abs(v_pct_sum - 100.0) > 0.001 then
    raise exception 'percentage sum drifted: % (must equal 100)', v_pct_sum;
  end if;

  insert into public.investments (
    investor_id,
    amount_nok,
    equity_before_nok,
    equity_after_nok,
    percentage_before,
    percentage_after
  ) values (
    v_investor_id,
    p_amount_nok,
    p_equity_now_nok,
    v_new_equity,
    v_old_percentage,
    v_new_percentage
  );

  return query select v_investor_id, v_new_percentage, v_new_equity;
end;
$$;

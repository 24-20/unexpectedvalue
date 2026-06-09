-- Lifetime betting PnL at capture time, in NOK.
-- Sum of Polymarket positions' cashPnl + realized PnL from settled custom_bets,
-- multiplied by the snapshot's usd_nok rate. Null for snapshots written before
-- this column existed.

alter table public.portfolio_snapshots
  add column if not exists pnl_nok numeric(18, 2);

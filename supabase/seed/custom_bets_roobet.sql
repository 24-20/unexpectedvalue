-- One-off seed: Roobet soccer bet, $10 stake at 2.50 odds, placed 20 minutes ago.
-- Update / delete from Supabase Studio when the bet settles.

insert into public.custom_bets
  (bookie, title, outcome, stake_usd, odds_decimal, placed_at, status)
values
  ('Roobet', 'Soccer match', 'Selection', 10.00, 2.500,
   now() - interval '20 minutes', 'pending');

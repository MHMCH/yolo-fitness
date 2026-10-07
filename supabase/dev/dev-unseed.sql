-- DEVELOPMENT ONLY. Removes the data dev-seed.sql created and restores the real season start.
-- Removes: seeded sessions (created_at = trained_on 12:00:00 UTC exactly) and all teams of the test season,
-- and resets the season start to 2026-10-01. The u1..u11 accounts, their display names and
-- last-year counts are left as they are.
do $unseed$
begin
  delete from public.teams where season_id in (select id from public.seasons where name = 'Season 2026/27');
  delete from public.training_sessions where created_at = ((trained_on + time '12:00') at time zone 'UTC');
  update public.seasons set starts_on = date '2026-10-01' where name = 'Season 2026/27';
end;
$unseed$;

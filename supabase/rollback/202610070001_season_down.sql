-- Undo 202610070001_season.sql. Run it in the SQL editor only if you need to back the season feature out.
-- It removes the objects that migration created. training_sessions rows and auth.users are not touched,
-- but everything stored in the new tables is lost: display names in profiles, last_year_count, is_admin,
-- seasons, teams and team memberships. Afterwards deploy a frontend from before the season feature
-- (it reads display names from the user metadata, which this migration never changed).
begin;
drop trigger if exists training_sessions_open_month on public.training_sessions;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.set_team_assignments(integer, jsonb);
drop function if exists public.team_daily_counts(integer, integer);
drop function if exists public.team_quarter_standings(integer);
drop function if exists public.team_month_standings(integer, integer);
drop function if exists public.season_daily_counts();
drop function if exists public.season_ranking();
drop function if exists public.handle_new_user();
drop schema if exists private cascade;
drop table if exists public.team_members, public.teams, public.profiles, public.seasons;
commit;

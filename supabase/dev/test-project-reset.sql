-- DEVELOPMENT ONLY, for a TEST project that ran the earlier season/profiles/teams migrations
-- (replaced by the league design). Removes every object those migrations created. Nothing in
-- training_sessions or auth.users is touched, but profiles, seasons, teams and the unlock flags are dropped.
-- Afterwards run, in order: 202610060001_leaderboard.sql, 202610070001_month_lock_and_daily_points.sql.
-- Never run this on production: production never had these objects.
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

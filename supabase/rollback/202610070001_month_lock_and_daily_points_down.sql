-- Undo 202610070001_month_lock_and_daily_points.sql. Only the trigger and two functions are removed;
-- training_sessions and auth.users are not touched.
begin;
drop trigger if exists training_sessions_open_month on public.training_sessions;
drop function if exists public.enforce_open_month();
drop function if exists public.daily_points(date, date);
commit;

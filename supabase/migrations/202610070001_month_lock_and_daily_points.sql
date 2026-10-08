-- Month lock and daily point series. Creates no tables or columns and can be run more than once.

-- Signed-in clients may only add or delete sessions in the current Berlin month, so closed months stay
-- fixed. Calls without a user token (the dashboard SQL editor, the service role) bypass the lock;
-- that is the intended way for the project owner to fix a forgotten session.
create or replace function public.enforce_open_month() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Berlin')::date;
  target date := case when tg_op = 'DELETE' then old.trained_on else new.trained_on end;
begin
  if (select auth.uid()) is not null and target < date_trunc('month', today::timestamp)::date then
    raise exception 'training month is locked' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.enforce_open_month() from public, anon, authenticated;

drop trigger if exists training_sessions_open_month on public.training_sessions;
create trigger training_sessions_open_month before insert or delete on public.training_sessions
  for each row execute function public.enforce_open_month();

-- Sessions per account and day for charts and league standings. Like leaderboard() this is an aggregate:
-- one row per active account with parallel arrays of training dates and session counts, never
-- individual session rows. One row per account keeps the result far below the API's row limit.
create or replace function public.daily_points(from_date date, to_date date)
returns table (user_id uuid, days date[], points integer[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if from_date is null or to_date is null or from_date >= to_date or to_date - from_date > 400 then
    raise exception 'Invalid date range.' using errcode = '22023';
  end if;
  return query
    select u.id, coalesce(d.day_list, '{}'::date[]), coalesce(d.point_list, '{}'::integer[])
    from auth.users u
    left join lateral (
      select array_agg(x.day order by x.day) as day_list, array_agg(x.n order by x.day) as point_list
      from (
        select s.trained_on as day, count(*)::integer as n
        from public.training_sessions s
        where s.user_id = u.id and s.trained_on >= from_date and s.trained_on < to_date
        group by s.trained_on
      ) x
    ) d on true
    where (select auth.uid()) is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now());
end;
$$;

revoke all on function public.daily_points(date, date) from public, anon;
grant execute on function public.daily_points(date, date) to authenticated;

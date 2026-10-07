-- Additive only: aggregate read access for the leaderboard and league. Individual rows stay owner-only.

create or replace function public.leaderboard()
returns table (user_id uuid, display_name text, total_points bigint, points_before_today bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''), 'Member'), 40),
    count(s.id),
    count(s.id) filter (where s.trained_on < (now() at time zone 'Europe/Berlin')::date)
  from auth.users u
  left join public.training_sessions s on s.user_id = u.id
  where (select auth.uid()) is not null
    and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
  group by u.id;
$$;

create or replace function public.monthly_points(from_date date, to_date date)
returns table (user_id uuid, month date, points bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if from_date is null or to_date is null or from_date >= to_date or to_date - from_date > 366 then
    raise exception 'Invalid date range.' using errcode = '22023';
  end if;
  return query
    select s.user_id, date_trunc('month', s.trained_on)::date, count(*)
    from public.training_sessions s
    where (select auth.uid()) is not null
      and s.trained_on >= from_date
      and s.trained_on < to_date
    group by s.user_id, date_trunc('month', s.trained_on);
end;
$$;

revoke all on function public.leaderboard() from public, anon;
revoke all on function public.monthly_points(date, date) from public, anon;
grant execute on function public.leaderboard() to authenticated;
grant execute on function public.monthly_points(date, date) to authenticated;

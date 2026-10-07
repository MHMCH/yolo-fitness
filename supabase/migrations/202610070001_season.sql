-- Season, profiles, teams, month lock and aggregate-only ranking functions.
-- Additive: the existing training_sessions table and training_summary() are unchanged.

create schema private;
revoke all on schema private from public, anon, authenticated;

create function private.berlin_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Berlin')::date
$$;

-- Seasons -------------------------------------------------------------------
create table public.seasons (
  id integer generated always as identity primary key,
  name text not null,
  starts_on date not null unique
);
insert into public.seasons (name, starts_on) values ('Season 2026/27', date '2026-10-01');
alter table public.seasons enable row level security;
revoke all on public.seasons from anon, authenticated;
grant select on public.seasons to authenticated;
create policy seasons_select on public.seasons for select to authenticated using (true);

-- A season lasts 12 monthly periods counted from starts_on; quarters are groups of three.
create function private.current_season(p_today date) returns public.seasons
language sql stable set search_path = '' as $$
  select s from public.seasons s
  where s.starts_on <= p_today and p_today < (s.starts_on + interval '12 months')::date
  order by s.starts_on desc limit 1
$$;

create function private.period_start(p_start date, p_index integer) returns date
language sql immutable set search_path = '' as $$
  select (p_start + p_index * interval '1 month')::date
$$;

create function private.period_index(p_start date, p_day date) returns integer
language sql immutable set search_path = '' as $$
  select (extract(year from age(p_day, p_start)) * 12 + extract(month from age(p_day, p_start)))::integer
$$;

create function private.month_bounds(p_today date, p_quarter integer, p_month integer)
returns table (season_id integer, lo date, hi date)
language sql stable set search_path = '' as $$
  select s.id,
    private.period_start(s.starts_on, (p_quarter - 1) * 3 + p_month - 1),
    private.period_start(s.starts_on, (p_quarter - 1) * 3 + p_month)
  from private.current_season(p_today) s
  where s.id is not null and p_quarter between 1 and 4 and p_month between 1 and 3
$$;

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  last_year_count integer check (last_year_count is null or last_year_count >= 0),
  is_admin boolean not null default false
);
create unique index profiles_display_name_key on public.profiles (lower(display_name));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, last_year_count) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Every existing account gets a profile. Names are copied from the user metadata (read-only);
-- if two accounts share a name (ignoring case), only the earliest keeps it and the other
-- starts without a name instead of losing its profile.
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

update public.profiles p set display_name = n.name
from (
  select id, name, row_number() over (partition by lower(name) order by created_at, id) as position
  from (
    select id, created_at, nullif(left(btrim(coalesce(raw_user_meta_data ->> 'display_name', '')), 40), '') as name
    from auth.users
  ) named
  where name is not null
) n
where p.user_id = n.id and n.position = 1;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), ''));
  return new;
exception when unique_violation then
  -- A taken name must never prevent account creation; the user is asked for a name instead.
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Teams (written only through set_team_assignments) --------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  season_id integer not null references public.seasons (id) on delete cascade,
  quarter smallint not null check (quarter between 1 and 4),
  slot smallint not null check (slot between 1 and 8),
  unique (season_id, quarter, slot),
  unique (id, season_id, quarter)
);
create table public.team_members (
  season_id integer not null,
  quarter smallint not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  team_id uuid not null,
  primary key (season_id, quarter, user_id),
  foreign key (team_id, season_id, quarter) references public.teams (id, season_id, quarter) on delete cascade
);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
revoke all on public.teams, public.team_members from anon, authenticated;
grant select on public.teams, public.team_members to authenticated;
create policy teams_select on public.teams for select to authenticated using (true);
create policy team_members_select on public.team_members for select to authenticated using (true);

-- Month lock: clients can only add or remove sessions in the current monthly period.
-- Calls without a user JWT (dashboard SQL editor, service role) bypass the lock.
create function private.enforce_open_month() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := private.berlin_today();
  season public.seasons := private.current_season(private.berlin_today());
  target_day date := case when tg_op = 'DELETE' then old.trained_on else new.trained_on end;
begin
  if (select auth.uid()) is not null then
    if season.id is null then
      raise exception 'no active season' using errcode = '23514';
    end if;
    if target_day < private.period_start(season.starts_on, private.period_index(season.starts_on, today)) then
      raise exception 'training month is locked' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger training_sessions_open_month before insert or delete on public.training_sessions
  for each row execute function private.enforce_open_month();

-- Aggregate calculations. They take today as a parameter so tests can fix the date. ---
create function private.team_month_standings(p_today date, p_quarter integer, p_month integer)
returns table (team_id uuid, slot smallint, members text[], member_count integer, sessions bigint,
  average numeric, rank integer, bonus integer, started boolean, closed boolean)
language sql stable set search_path = '' as $$
  with agg as (
    select t.id, t.slot, b.lo, b.hi,
      (select array_agg(coalesce(p.display_name, 'Unnamed') order by coalesce(p.display_name, 'Unnamed'), m.user_id)
         from public.team_members m left join public.profiles p on p.user_id = m.user_id
         where m.team_id = t.id) as members,
      (select count(*) from public.team_members m where m.team_id = t.id)::integer as member_count,
      (select count(*) from public.team_members m
         join public.training_sessions ts on ts.user_id = m.user_id
         where m.team_id = t.id and ts.trained_on >= b.lo and ts.trained_on < b.hi) as sessions
    from private.month_bounds(p_today, p_quarter, p_month) b
    join public.teams t on t.season_id = b.season_id and t.quarter = p_quarter
  ), scored as (
    select agg.*, agg.sessions::numeric / agg.member_count as average
    from agg where agg.member_count > 0
  ), ranked as (
    select scored.*, (dense_rank() over (order by scored.average desc))::integer as place from scored
  )
  select r.id, r.slot, r.members, r.member_count, r.sessions, r.average, r.place,
    case when p_today >= r.hi and r.place <= 3 then 4 - r.place end,
    p_today >= r.lo, p_today >= r.hi
  from ranked r order by r.place, r.slot
$$;

create function private.team_quarter_standings(p_today date, p_quarter integer)
returns table (team_id uuid, slot smallint, members text[], member_count integer,
  scores numeric[], bonuses integer[], total numeric, rank integer)
language sql stable set search_path = '' as $$
  with months as (
    select g.m, ms.team_id as tid, ms.slot, ms.members, ms.member_count, ms.average, ms.bonus, ms.started, ms.closed
    from generate_series(1, 3) as g(m)
    cross join lateral private.team_month_standings(p_today, p_quarter, g.m) ms
  ), agg as (
    select mo.tid, min(mo.slot) as slot, mo.members,
      min(mo.member_count) as member_count,
      array_agg(case when mo.started then mo.average end order by mo.m) as scores,
      array_agg(case when mo.closed then mo.bonus end order by mo.m) as bonuses,
      sum(case when mo.started then mo.average + coalesce(mo.bonus, 0) else 0 end) as total
    from months mo group by mo.tid, mo.members
  )
  select a.tid, a.slot, a.members, a.member_count, a.scores, a.bonuses, a.total,
    (dense_rank() over (order by a.total desc))::integer
  from agg a order by 8, a.slot
$$;

create function private.team_daily_counts(p_today date, p_quarter integer, p_month integer)
returns table (team_id uuid, slot smallint, days date[], counts integer[])
language sql stable set search_path = '' as $$
  select t.id, t.slot, coalesce(d.days, '{}'), coalesce(d.counts, '{}')
  from private.month_bounds(p_today, p_quarter, p_month) b
  join public.teams t on t.season_id = b.season_id and t.quarter = p_quarter
  left join lateral (
    select array_agg(x.day order by x.day) as days, array_agg(x.n order by x.day) as counts
    from (
      select ts.trained_on as day, count(*)::integer as n
      from public.team_members m join public.training_sessions ts on ts.user_id = m.user_id
      where m.team_id = t.id and ts.trained_on >= b.lo and ts.trained_on < b.hi
      group by ts.trained_on
    ) x
  ) d on true
  order by t.slot
$$;

create function private.season_ranking(p_today date)
returns table (user_id uuid, display_name text, sessions bigint, rank integer, last_year_count integer)
language sql stable set search_path = '' as $$
  with s as (select * from private.current_season(p_today) where id is not null),
  counted as (
    select p.user_id, coalesce(p.display_name, 'Unnamed') as display_name,
      count(ts.id) as sessions, p.last_year_count
    from s cross join public.profiles p
    left join public.training_sessions ts on ts.user_id = p.user_id
      and ts.trained_on >= s.starts_on and ts.trained_on < (s.starts_on + interval '12 months')::date
    group by p.user_id, p.display_name, p.last_year_count
  )
  select c.user_id, c.display_name, c.sessions, (dense_rank() over (order by c.sessions desc))::integer, c.last_year_count
  from counted c order by 4, c.display_name
$$;

create function private.season_daily_counts(p_today date)
returns table (user_id uuid, days date[], counts integer[])
language sql stable set search_path = '' as $$
  with s as (select * from private.current_season(p_today) where id is not null)
  select p.user_id, coalesce(d.days, '{}'), coalesce(d.counts, '{}')
  from s cross join public.profiles p
  left join lateral (
    select array_agg(x.day order by x.day) as days, array_agg(x.n order by x.day) as counts
    from (
      select ts.trained_on as day, count(*)::integer as n
      from public.training_sessions ts
      where ts.user_id = p.user_id and ts.trained_on >= s.starts_on
        and ts.trained_on < (s.starts_on + interval '12 months')::date
      group by ts.trained_on
    ) x
  ) d on true
$$;

revoke all on all functions in schema private from public, anon, authenticated;

-- Public aggregate API: security definer by design (callers must see other users' totals),
-- but they return counts and names only, never individual session rows. -------------
create function public.season_ranking()
returns table (user_id uuid, display_name text, sessions bigint, rank integer, last_year_count integer)
language sql stable security definer set search_path = '' as $$
  select * from private.season_ranking(private.berlin_today())
$$;

create function public.season_daily_counts()
returns table (user_id uuid, days date[], counts integer[])
language sql stable security definer set search_path = '' as $$
  select * from private.season_daily_counts(private.berlin_today())
$$;

create function public.team_month_standings(p_quarter integer, p_month integer)
returns table (team_id uuid, slot smallint, members text[], member_count integer, sessions bigint,
  average numeric, rank integer, bonus integer, started boolean, closed boolean)
language sql stable security definer set search_path = '' as $$
  select * from private.team_month_standings(private.berlin_today(), p_quarter, p_month)
$$;

create function public.team_quarter_standings(p_quarter integer)
returns table (team_id uuid, slot smallint, members text[], member_count integer,
  scores numeric[], bonuses integer[], total numeric, rank integer)
language sql stable security definer set search_path = '' as $$
  select * from private.team_quarter_standings(private.berlin_today(), p_quarter)
$$;

create function public.team_daily_counts(p_quarter integer, p_month integer)
returns table (team_id uuid, slot smallint, days date[], counts integer[])
language sql stable security definer set search_path = '' as $$
  select * from private.team_daily_counts(private.berlin_today(), p_quarter, p_month)
$$;

-- Admin: replace a quarter's teams. p_teams is an array of arrays of user ids; array position is the slot/colour.
create function public.set_team_assignments(p_quarter integer, p_teams jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  season public.seasons := private.current_season(private.berlin_today());
begin
  if not exists (select 1 from public.profiles where user_id = (select auth.uid()) and is_admin) then
    raise exception 'administrator only' using errcode = '42501';
  end if;
  if season.id is null then
    raise exception 'no active season' using errcode = '23514';
  end if;
  if p_quarter is null or p_quarter not between 1 and 4 then
    raise exception 'invalid quarter' using errcode = '23514';
  end if;
  if jsonb_typeof(p_teams) is distinct from 'array' or jsonb_array_length(p_teams) not between 1 and 8
     or exists (select 1 from jsonb_array_elements(p_teams) e
                where jsonb_typeof(e) <> 'array' or jsonb_array_length(e) = 0) then
    raise exception 'invalid team list' using errcode = '23514';
  end if;
  delete from public.teams where season_id = season.id and quarter = p_quarter;
  insert into public.teams (season_id, quarter, slot)
    select season.id, p_quarter, t.ord::smallint from jsonb_array_elements(p_teams) with ordinality as t(team, ord);
  insert into public.team_members (season_id, quarter, user_id, team_id)
    select season.id, p_quarter, u.uid::uuid, tm.id
    from jsonb_array_elements(p_teams) with ordinality as t(team, ord)
    cross join lateral jsonb_array_elements_text(t.team) as u(uid)
    join public.teams tm on tm.season_id = season.id and tm.quarter = p_quarter and tm.slot = t.ord;
end;
$$;

revoke all on function public.season_ranking(), public.season_daily_counts(),
  public.team_month_standings(integer, integer), public.team_quarter_standings(integer),
  public.team_daily_counts(integer, integer), public.set_team_assignments(integer, jsonb) from public, anon;
grant execute on function public.season_ranking(), public.season_daily_counts(),
  public.team_month_standings(integer, integer), public.team_quarter_standings(integer),
  public.team_daily_counts(integer, integer), public.set_team_assignments(integer, jsonb) to authenticated;

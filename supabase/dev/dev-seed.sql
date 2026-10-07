-- DEVELOPMENT ONLY. Seeds a TEST Supabase project with realistic data. Never run this on production.
--
-- Run in the dashboard SQL Editor (it runs without a user session, so the month lock does not apply).
-- It expects the existing test accounts u1@test.test .. u11@test.test (u1 = Max, the admin) and:
--   * moves the test season's start date to v_start so several months are closed and one is live
--   * names the 11 profiles, gives each a plausible last-year count and unlocks the season screens
--   * adds random sessions from v_start until today: about half the group trains 0-2 times a week,
--     the other half 1-3 times (each person gets a fixed random rate in their range)
--   * sets the Q1 teams to the five fixed teams below
-- Undo with dev-unseed.sql. Seeded sessions carry created_at = trained_on 12:00:00 UTC exactly,
-- which is how the unseed script recognises them.
do $seed$
declare
  v_is_test_db boolean := false;                -- change to true to confirm this is NOT production
  v_start date := date '2026-08-01';             -- test season start; the real one is 2026-10-01
  -- u1 .. u11, in order
  v_names text[] := array['Max', 'Marco', 'Daniel', 'Jens', 'Jonas', 'Seba', 'Philipp', 'Axel', 'Jörg', 'Tobi', 'Torben'];
  v_teams jsonb := '[["Seba","Jonas","Philipp"],["Torben","Daniel"],["Tobi","Marco"],["Max","Axel"],["Jens","Jörg"]]';
  v_today date := private.berlin_today();
  v_season integer;
  v_quarter integer;
  v_id uuid;
  v_rate numeric;
  v_low boolean;
  i integer;
begin
  if not v_is_test_db then
    raise exception 'Refusing to seed: set v_is_test_db to true only on a test project.';
  end if;
  if (select count(*) from auth.users where email in (select 'u' || n || '@test.test' from generate_series(1, 11) n)) <> 11 then
    raise exception 'Expected the accounts u1@test.test .. u11@test.test to exist.';
  end if;
  if exists (select 1 from public.training_sessions where created_at = ((trained_on + time '12:00') at time zone 'UTC')) then
    raise exception 'Seeded sessions already exist. Run dev-unseed.sql first.';
  end if;
  if v_start > v_today then
    raise exception 'v_start must not be in the future.';
  end if;

  perform setseed(0.37);
  update public.seasons set starts_on = v_start where name = 'Season 2026/27' returning id into v_season;
  if v_season is null then raise exception 'Season 2026/27 not found.'; end if;
  v_quarter := private.period_index(v_start, v_today) / 3 + 1;

  -- Clear names first so reseeding or renaming cannot trip the unique-name index.
  update public.profiles set display_name = null
    where user_id in (select id from auth.users where email in (select 'u' || n || '@test.test' from generate_series(1, 11) n));

  for i in 1 .. 11 loop
    select id into v_id from auth.users where email = 'u' || i || '@test.test';
    v_low := random() < 0.5;
    v_rate := case when v_low then random() * 2 else 1 + random() * 2 end;   -- sessions per week
    update public.profiles
      set display_name = v_names[i], last_year_count = round(v_rate * 52 * (0.7 + random() * 0.7))::integer,
        features_unlocked_at = coalesce(features_unlocked_at, now())
      where user_id = v_id;
    -- weekend bias, rare double sessions
    insert into public.training_sessions (id, user_id, trained_on, created_at)
    select gen_random_uuid(), v_id, day::date, ((day::date + time '12:00') at time zone 'UTC')
    from generate_series(v_start, v_today, interval '1 day') as day
    cross join lateral (
      select case when random() < least(0.85, v_rate / 7.0
          * case when extract(isodow from day) >= 6 then 1.35 else 0.93 end)
        then 1 + (random() < 0.05)::integer else 0 end as n
    ) as sessions
    cross join lateral generate_series(1, sessions.n);
  end loop;

  -- Teams for the current quarter, by display name.
  delete from public.teams where season_id = v_season and quarter = v_quarter;
  insert into public.teams (season_id, quarter, slot)
    select v_season, v_quarter, ordinality::smallint from jsonb_array_elements(v_teams) with ordinality;
  insert into public.team_members (season_id, quarter, user_id, team_id)
    select v_season, v_quarter, p.user_id, t.id
    from jsonb_array_elements(v_teams) with ordinality as team(members, slot)
    cross join lateral jsonb_array_elements_text(team.members) as member(name)
    join public.profiles p on p.display_name = member.name
    join public.teams t on t.season_id = v_season and t.quarter = v_quarter and t.slot = team.slot;
end;
$seed$;

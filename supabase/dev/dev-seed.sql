-- DEVELOPMENT ONLY. Seeds a TEST Supabase project with realistic data. Never run this on production.
--
-- Run in the dashboard SQL Editor (it runs without a user session, so the month lock does not apply).
-- It expects the existing test accounts u1@test.test .. u11@test.test and:
--   * names them (account metadata, like the app does) and gives each a plausible last-year count; with
--     v_unlock_accounts = true it also marks the accounts as unlocked, so the season screens are visible without
--     seeing the celebration first (leave it false to test the celebration)
--   * adds random sessions from v_start until today: about half the group trains 0-2 times a week,
--     the other half 1-3 times (each person gets a fixed random rate in their range). With the default
--     v_start two quarters are finished and have a champion; the current quarter is running.
--   * ends with a result row `local_ts`: paste its text into src/config/local.ts (ignored by git, read only by
--     the dev server). It maps your test accounts' ids to the owner's team lists and sets the earlier season start.
-- Undo with dev-unseed.sql. Seeded sessions carry created_at = trained_on 12:00:00 UTC exactly,
-- which is how the unseed script recognises them.
do $seed$
declare
  v_is_test_db boolean := false;                -- change to true to confirm this is NOT production
  v_unlock_accounts boolean := false;           -- true: skip the celebration, the season screens are visible at once
  v_start date := date '2026-04-01';            -- first day of the test season (the real one is 2026-10-01)
  -- u1 .. u11, in order
  v_names text[] := array['Max', 'Marco', 'Daniel', 'Jens', 'Jonas', 'Seba', 'Philipp', 'Axel', 'Jörg', 'Tobi', 'Torben'];
  v_today date := (now() at time zone 'Europe/Berlin')::date;
  v_id uuid;
  v_rate numeric;
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
  for i in 1 .. 11 loop
    select id into v_id from auth.users where email = 'u' || i || '@test.test';
    v_rate := case when random() < 0.5 then random() * 2 else 1 + random() * 2 end;   -- sessions per week
    update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'display_name', v_names[i],
        'last_year_count', round(v_rate * 52 * (0.7 + random() * 0.7))::integer)
        || case when v_unlock_accounts
             then jsonb_build_object('features_unlocked_at', coalesce(raw_user_meta_data ->> 'features_unlocked_at', now()::text))
             else '{}'::jsonb end
      where id = v_id;
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
end;
$seed$;

-- The text to paste into src/config/local.ts: your test accounts' ids with the owner's team lists.
select format($ts$import type { LeagueConfig } from './league'

export const seasonStart = %L

%s

export const league: LeagueConfig = {
  '2026-Q2': [[marco, max, jonas], [daniel, philipp], [jens, axel], [joerg, seba], [tobi, torben]],
  '2026-Q3': [[joerg, daniel, tobi], [jens, seba], [jonas, axel], [marco, torben], [max, philipp]],
  '2026-Q4': [[seba, jonas, philipp], [torben, daniel], [tobi, marco], [max, axel], [jens, joerg]],
}
$ts$, '2026-04-01', (
  select string_agg(format('const %s = %L', names.var, u.id), E'\n' order by names.n)
  from unnest(array['max', 'marco', 'daniel', 'jens', 'jonas', 'seba', 'philipp', 'axel', 'joerg', 'tobi', 'torben']) with ordinality as names(var, n)
  join auth.users u on u.email = 'u' || names.n || '@test.test'
)) as local_ts;

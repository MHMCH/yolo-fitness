-- DEVELOPMENT ONLY. Prints the text for src/config/local.ts for a TEST project without seeding anything:
-- run it in the SQL editor and paste the `local_ts` result into src/config/local.ts. It needs the accounts
-- u1@test.test .. u11@test.test. (dev-seed.sql prints the same text at its end.)
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

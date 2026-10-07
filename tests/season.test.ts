import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase } from './pgHelper'

const ids = Object.fromEntries('abcdefgh'.split('').map((letter, index) =>
  [letter, `${String(index + 1).repeat(8)}-${String(index + 1).repeat(4)}-4${String(index + 1).repeat(3)}-8${String(index + 1).repeat(3)}-${String(index + 1).repeat(12)}`]))
const names: Record<string, string> = { a: 'Anna', b: 'Ben', c: 'Cem', d: 'Dora', e: 'Eli', f: 'Fay', g: 'Gus', h: 'Hal' }
const monthStart = `date_trunc('month', now() at time zone 'Europe/Berlin')::date`

describe('season, profiles, month lock and aggregate functions', () => {
  let database: PGlite
  let asUser: Awaited<ReturnType<typeof createDatabase>>['asUser']
  beforeAll(async () => {
    const created = await createDatabase(Object.keys(ids).map((key) => ({ id: ids[key], name: names[key] })))
    database = created.database
    asUser = created.asUser
    await database.exec(`update public.profiles set is_admin = true where user_id = '${ids.a}'`)
  }, 30_000)
  afterAll(async () => { await database?.close() })

  describe('profiles', () => {
    it('backfills names and lets everyone read all profiles', async () => {
      const result = await asUser('authenticated', ids.b, 'select display_name from public.profiles order by display_name')
      expect(result.rows.map((row) => row.display_name)).toEqual(Object.values(names).sort())
    })
    it('creates a profile for new accounts', async () => {
      const id = '99999999-9999-4999-8999-999999999999'
      await database.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"display_name":"  Ivy  "}')`, [id])
      expect((await database.query(`select display_name from public.profiles where user_id = $1`, [id])).rows).toEqual([{ display_name: 'Ivy' }])
      await database.query('delete from auth.users where id = $1', [id])
    })
    it('lets users edit only their own name and last-year count', async () => {
      await asUser('authenticated', ids.b, `update public.profiles set display_name = 'Benny', last_year_count = 87 where user_id = '${ids.b}'`)
      expect((await asUser('authenticated', ids.b, `select display_name, last_year_count from public.profiles where user_id = '${ids.b}'`)).rows)
        .toEqual([{ display_name: 'Benny', last_year_count: 87 }])
      expect((await asUser('authenticated', ids.b, `update public.profiles set display_name = 'Hacked' where user_id = '${ids.c}' returning user_id`)).rows).toEqual([])
      await asUser('authenticated', ids.b, `update public.profiles set display_name = 'Ben' where user_id = '${ids.b}'`)
    })
    it('lets users record their own unlock time but nobody else\'s', async () => {
      expect((await asUser('authenticated', ids.b, `select features_unlocked_at from public.profiles where user_id = '${ids.b}'`)).rows).toEqual([{ features_unlocked_at: null }])
      await asUser('authenticated', ids.b, `update public.profiles set features_unlocked_at = now() where user_id = '${ids.b}'`)
      expect((await asUser('authenticated', ids.b, `select features_unlocked_at is not null as unlocked from public.profiles where user_id = '${ids.b}'`)).rows).toEqual([{ unlocked: true }])
      expect((await asUser('authenticated', ids.b, `update public.profiles set features_unlocked_at = now() where user_id = '${ids.c}' returning user_id`)).rows).toEqual([])
      await expect(asUser('anon', '', `update public.profiles set features_unlocked_at = now()`)).rejects.toMatchObject({ code: '42501' })
    })
    it('blocks self-promotion, duplicate names and invalid counts', async () => {
      await expect(asUser('authenticated', ids.b, `update public.profiles set is_admin = true where user_id = '${ids.b}'`)).rejects.toMatchObject({ code: '42501' })
      await expect(asUser('authenticated', ids.b, `update public.profiles set display_name = 'ANNA' where user_id = '${ids.b}'`)).rejects.toMatchObject({ code: '23505' })
      await expect(asUser('authenticated', ids.b, `update public.profiles set last_year_count = -1 where user_id = '${ids.b}'`)).rejects.toMatchObject({ code: '23514' })
      await expect(asUser('authenticated', ids.b, `insert into public.profiles(user_id) values ('${ids.b}')`)).rejects.toMatchObject({ code: '42501' })
      await expect(asUser('anon', '', 'select * from public.profiles')).rejects.toMatchObject({ code: '42501' })
    })
  })

  describe('month lock', () => {
    it('allows the current month and blocks closed months for clients', async () => {
      await asUser('authenticated', ids.c, `insert into public.training_sessions(id, trained_on) values ('c0000000-0000-4000-8000-000000000001', ${monthStart})`)
      await expect(asUser('authenticated', ids.c,
        `insert into public.training_sessions(id, trained_on) values ('c0000000-0000-4000-8000-000000000002', ${monthStart} - 1)`)).rejects.toMatchObject({ code: '23514' })
    })
    it('blocks deleting a session from a closed month but not the dashboard', async () => {
      await database.exec(`insert into public.training_sessions(id, user_id, trained_on) values ('c0000000-0000-4000-8000-000000000003', '${ids.c}', ${monthStart} - 1)`)
      await expect(asUser('authenticated', ids.c, `delete from public.training_sessions where id = 'c0000000-0000-4000-8000-000000000003'`)).rejects.toMatchObject({ code: '23514' })
      await database.exec(`delete from public.training_sessions where id = 'c0000000-0000-4000-8000-000000000003'`)
      expect((await asUser('authenticated', ids.c, `delete from public.training_sessions where id = 'c0000000-0000-4000-8000-000000000001' returning id`)).rows).toHaveLength(1)
    })
  })

  describe('team administration', () => {
    it('is closed to clients and non-admins', async () => {
      await expect(asUser('authenticated', ids.a, `insert into public.teams(season_id, quarter, slot) values (1, 1, 1)`)).rejects.toMatchObject({ code: '42501' })
      await expect(asUser('authenticated', ids.b, `select public.set_team_assignments(1, '[["${ids.b}","${ids.c}"]]')`)).rejects.toMatchObject({ code: '42501' })
      await expect(asUser('anon', '', `select public.set_team_assignments(1, '[]')`)).rejects.toMatchObject({ code: '42501' })
    })
    it('lets an admin set and replace a quarter and validates input', async () => {
      await asUser('authenticated', ids.a, `select public.set_team_assignments(1, '[["${ids.a}","${ids.b}"],["${ids.c}","${ids.d}","${ids.e}"]]')`)
      expect((await asUser('authenticated', ids.f, 'select count(*)::int as n from public.team_members')).rows).toEqual([{ n: 5 }])
      await asUser('authenticated', ids.a, `select public.set_team_assignments(1, '[["${ids.a}","${ids.c}"],["${ids.b}","${ids.d}"]]')`)
      expect((await asUser('authenticated', ids.f, 'select count(*)::int as n from public.team_members')).rows).toEqual([{ n: 4 }])
      await expect(asUser('authenticated', ids.a, `select public.set_team_assignments(1, '[["${ids.a}"],["${ids.a}"]]')`)).rejects.toMatchObject({ code: '23505' })
      await expect(asUser('authenticated', ids.a, `select public.set_team_assignments(1, '[["${ids.a}"],[]]')`)).rejects.toMatchObject({ code: '23514' })
      await expect(asUser('authenticated', ids.a, `select public.set_team_assignments(5, '[["${ids.a}"]]')`)).rejects.toMatchObject({ code: '23514' })
      expect((await asUser('authenticated', ids.f, 'select count(*)::int as n from public.team_members')).rows).toEqual([{ n: 4 }])
    })
  })

  describe('standings with a fixed date (season starting 2020-10-01)', () => {
    let team: Record<string, string>
    async function sessions(user: string, day: string, count: number) {
      for (let index = 0; index < count; index++) {
        await database.query('insert into public.training_sessions(id, user_id, trained_on) values (gen_random_uuid(), $1, $2)', [ids[user], day])
      }
    }
    beforeAll(async () => {
      await database.exec(`
        insert into public.teams(season_id, quarter, slot) select id, 1, g from public.seasons, generate_series(1, 3) g where starts_on = date '2020-10-01';
      `)
      const rows = (await database.query<{ id: string; slot: number }>(
        `select t.id, t.slot from public.teams t join public.seasons s on s.id = t.season_id where s.starts_on = date '2020-10-01'`)).rows
      team = Object.fromEntries(rows.map((row) => [`t${row.slot}`, row.id]))
      const members: Record<string, string[]> = { t1: ['a', 'b'], t2: ['c', 'd'], t3: ['e', 'f', 'g'] }
      for (const [slot, users] of Object.entries(members)) {
        for (const user of users) {
          await database.query(`insert into public.team_members(season_id, quarter, user_id, team_id)
            select season_id, 1, $1, id from public.teams where id = $2`, [ids[user], team[slot]])
        }
      }
      // October: t1 = (3+1)/2 = 2, t2 = (2+2)/2 = 2, t3 = 3/3 = 1
      await sessions('a', '2020-10-03', 2); await sessions('a', '2020-10-04', 1); await sessions('b', '2020-10-04', 1)
      await sessions('c', '2020-10-05', 2); await sessions('d', '2020-10-06', 2)
      await sessions('e', '2020-10-07', 1); await sessions('f', '2020-10-07', 1); await sessions('g', '2020-10-08', 1)
      // November: t3 = 9/3 = 3 and a session before the season that must not count
      await sessions('e', '2020-11-02', 4); await sessions('f', '2020-11-03', 3); await sessions('g', '2020-11-03', 2)
      await sessions('a', '2020-09-30', 5)
    })
    const q = (name: string) => `select * from private.${name}`

    it('ranks ties together and gives the next team the next place', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`team_month_standings(date '2020-11-10', 1, 1)`))).rows
      expect(rows.map((row) => [row.slot, Number(row.average), row.rank, row.bonus, row.closed])).toEqual([
        [1, 2, 1, 3, true], [2, 2, 1, 3, true], [3, 1, 2, 2, true]])
      expect(rows[2].members).toEqual(['Eli', 'Fay', 'Gus'])
    })
    it('shows the running month live without bonus', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`team_month_standings(date '2020-11-10', 1, 2)`))).rows
      expect(rows.map((row) => [row.slot, Number(row.average), row.rank, row.bonus, row.started, row.closed])).toEqual([
        [3, 3, 1, null, true, false], [1, 0, 2, null, true, false], [2, 0, 2, null, true, false]])
      const early = (await database.query<Record<string, unknown>>(q(`team_month_standings(date '2020-10-20', 1, 1)`))).rows
      expect(early.every((row) => row.closed === false && row.bonus === null)).toBe(true)
    })
    it('treats future months as not started', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`team_month_standings(date '2020-11-10', 1, 3)`))).rows
      expect(rows.every((row) => row.started === false && Number(row.sessions) === 0)).toBe(true)
    })
    it('sums closed months with bonus and the live month without', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`team_quarter_standings(date '2020-11-10', 1)`))).rows
      expect(rows.map((row) => [row.slot, Number(row.total), row.rank])).toEqual([[3, 6, 1], [1, 5, 2], [2, 5, 2]])
      expect((rows[0].scores as Array<string | null>).map((value) => value === null ? null : Number(value))).toEqual([1, 3, null])
      expect(rows[0].bonuses).toEqual([2, null, null])
    })
    it('returns daily counts per team for the graph', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`team_daily_counts(date '2020-11-10', 1, 1)`))).rows
      expect(rows[0].counts).toEqual([2, 2])
      expect(rows[0].days).toHaveLength(2)
      expect(rows[2].counts).toEqual([2, 1])
    })
    it('ranks individuals over the season only, counting inside the window', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`season_ranking(date '2020-11-10')`))).rows
      const byName = Object.fromEntries(rows.map((row) => [row.display_name, [Number(row.sessions), row.rank]]))
      expect(byName).toMatchObject({ Eli: [5, 1], Fay: [4, 2], Anna: [3, 3], Gus: [3, 3], Ben: [1, 5], Hal: [0, 6] })
    })
    it('returns daily series per user', async () => {
      const rows = (await database.query<Record<string, unknown>>(q(`season_daily_counts(date '2020-11-10')`))).rows
      expect(rows).toHaveLength(8)
      expect(rows.find((row) => row.user_id === ids.a)?.counts).toEqual([2, 1])
    })
  })

  describe('privacy of the aggregate API', () => {
    it('exposes the public functions to authenticated users with aggregate columns only', async () => {
      const ranking = await asUser('authenticated', ids.b, 'select * from public.season_ranking()')
      expect(Object.keys(ranking.rows[0]).sort()).toEqual(['display_name', 'last_year_count', 'rank', 'sessions', 'user_id'])
      const series = await asUser('authenticated', ids.b, 'select * from public.season_daily_counts()')
      expect(Object.keys(series.rows[0]).sort()).toEqual(['counts', 'days', 'user_id'])
    })
    it('keeps internal functions and other users’ sessions out of reach', async () => {
      await expect(asUser('authenticated', ids.b, `select * from private.season_ranking(date '2020-11-10')`)).rejects.toMatchObject({ code: '42501' })
      expect((await asUser('authenticated', ids.b, `select id from public.training_sessions where user_id = '${ids.e}'`)).rows).toEqual([])
    })
    it('denies anonymous callers', async () => {
      for (const query of ['select * from public.season_ranking()', 'select * from public.team_quarter_standings(1)',
        'select * from public.team_month_standings(1, 1)', 'select * from public.team_daily_counts(1, 1)', 'select * from public.season_daily_counts()']) {
        await expect(asUser('anon', '', query)).rejects.toMatchObject({ code: '42501' })
      }
    })
  })
})

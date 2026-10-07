import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase } from './pgHelper'

const ids = Array.from({ length: 11 }, (_, index) => `${String(index + 1).padStart(2, '0')}000000-0000-4000-8000-000000000000`)
const read = (name: string) => readFile(new URL(`../supabase/dev/${name}`, import.meta.url), 'utf8')
const withFlag = (sql: string, value: boolean) => sql.replace(/v_is_test_db boolean := (true|false)/, `v_is_test_db boolean := ${value}`)
const confirmed = (sql: string) => withFlag(sql, true)

describe('development seed and unseed scripts', () => {
  let database: PGlite
  let seed: string
  let unseed: string
  beforeAll(async () => {
    database = (await createDatabase(ids.map((id) => ({ id })))).database
    for (const [index, id] of ids.entries()) {
      await database.query(`update auth.users set email = $1 where id = $2`, [`u${index + 1}@test.test`, id])
    }
    await database.exec(`update public.profiles set is_admin = true where user_id = '${ids[0]}'`)
    seed = await read('dev-seed.sql')
    unseed = await read('dev-unseed.sql')
  }, 30_000)
  afterAll(async () => { await database?.close() })
  const count = async (query: string) => Number((await database.query<{ n: number }>(query)).rows[0].n)

  it('refuses to run until the test-database flag is set', async () => {
    await expect(database.exec(withFlag(seed, false))).rejects.toThrow(/Refusing to seed/)
  })
  it('names the users, seeds sessions inside the season and sets the fixed teams', async () => {
    await database.exec(confirmed(seed))
    const names = (await database.query<{ display_name: string }>(`select display_name from public.profiles order by user_id`)).rows.map((row) => row.display_name)
    expect(names).toEqual(['Max', 'Marco', 'Daniel', 'Jens', 'Jonas', 'Seba', 'Philipp', 'Axel', 'Jörg', 'Tobi', 'Torben'])
    expect(await count(`select count(*) n from public.profiles where last_year_count is not null`)).toBe(11)
    expect((await database.query(`select starts_on::text from public.seasons where name = 'Season 2026/27'`)).rows).toEqual([{ starts_on: '2026-08-01' }])
    expect(await count(`select count(*) n from public.training_sessions where trained_on < date '2026-08-01' or trained_on > private.berlin_today()`)).toBe(0)
    const teams = (await database.query<{ slot: number; members: string }>(
      `select t.slot, string_agg(p.display_name, ',' order by p.display_name) members
       from public.teams t join public.team_members m on m.team_id = t.id join public.profiles p on p.user_id = m.user_id
       group by t.slot order by t.slot`)).rows
    expect(teams.map((row) => row.members)).toEqual(['Jonas,Philipp,Seba', 'Daniel,Torben', 'Marco,Tobi', 'Axel,Max', 'Jens,Jörg'])
  })
  it('produces plausible activity levels across both halves of the group', async () => {
    const perWeek = (await database.query<{ rate: number }>(
      `select count(*)::numeric / ((private.berlin_today() - date '2026-08-01') / 7.0) as rate
       from public.training_sessions group by user_id`)).rows.map((row) => Number(row.rate))
    expect(perWeek.length).toBeGreaterThanOrEqual(9)
    expect(Math.max(...perWeek)).toBeLessThan(4)
    expect(perWeek.some((rate) => rate < 1.2)).toBe(true)
    expect(perWeek.some((rate) => rate > 1.5)).toBe(true)
  })
  it('refuses to seed twice', async () => {
    await expect(database.exec(confirmed(seed))).rejects.toThrow(/already exist/)
  })
  it('removes sessions and teams again and restores the season start', async () => {
    await database.exec(unseed)
    expect(await count('select count(*) n from public.training_sessions')).toBe(0)
    expect(await count('select count(*) n from public.teams')).toBe(0)
    expect(await count('select count(*) n from public.team_members')).toBe(0)
    expect((await database.query(`select starts_on::text from public.seasons where name = 'Season 2026/27'`)).rows).toEqual([{ starts_on: '2026-10-01' }])
    expect(await count('select count(*) n from public.profiles')).toBe(11)
  })
})

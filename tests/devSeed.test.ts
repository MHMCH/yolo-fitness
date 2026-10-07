import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase } from './pgHelper'

const ids = Array.from({ length: 11 }, (_, index) => `${String(index + 1).padStart(2, '0')}000000-0000-4000-8000-000000000000`)
const read = (name: string) => readFile(new URL(`../supabase/dev/${name}`, import.meta.url), 'utf8')
const withFlag = (sql: string, value: boolean) => sql.replace(/v_is_test_db boolean := (true|false)/, `v_is_test_db boolean := ${value}`)

describe('development seed and unseed scripts', () => {
  let database: PGlite
  let seed: string
  let unseed: string
  let snippet = ''
  beforeAll(async () => {
    database = (await createDatabase(ids.map((id, index) => ({ id, email: `u${index + 1}@test.test` })))).database
    seed = await read('dev-seed.sql')
    unseed = await read('dev-unseed.sql')
  }, 30_000)
  afterAll(async () => { await database?.close() })
  const count = async (query: string) => Number((await database.query<{ n: number }>(query)).rows[0].n)

  it('refuses to run until the test-database flag is set', async () => {
    await expect(database.exec(withFlag(seed, false))).rejects.toThrow(/Refusing to seed/)
  })
  it('names the accounts in their metadata and seeds sessions from the season start', async () => {
    const results = await database.exec(withFlag(seed, true))
    const metadata = (await database.query<{ meta: Record<string, unknown> }>(`select raw_user_meta_data as meta from auth.users order by email`)).rows
    const byName = metadata.map((row) => row.meta.display_name)
    expect(byName.sort()).toEqual(['Axel', 'Daniel', 'Jens', 'Jonas', 'Jörg', 'Marco', 'Max', 'Philipp', 'Seba', 'Tobi', 'Torben'].sort())
    expect(metadata.every((row) => Number.isInteger(row.meta.last_year_count) && typeof row.meta.features_unlocked_at === 'string')).toBe(true)
    expect(await count(`select count(*) n from public.training_sessions where trained_on < date '2026-04-01' or trained_on > (now() at time zone 'Europe/Berlin')::date`)).toBe(0)
    expect(await count(`select count(distinct user_id) n from public.training_sessions`)).toBeGreaterThanOrEqual(9)
    snippet = String((results[results.length - 1].rows[0] as { local_ts: string }).local_ts)
  })
  it('prints a local config with the test accounts and the season start', () => {
    expect(snippet).toContain(`export const seasonStart = '2026-04-01'`)
    expect(snippet).toContain(`const max = '${ids[0]}'`)
    expect(snippet).toContain(`const torben = '${ids[10]}'`)
    expect(snippet).toContain(`'2026-Q4': [[seba, jonas, philipp], [torben, daniel], [tobi, marco], [max, axel], [jens, joerg]]`)
    expect((snippet.match(/^const /gm) ?? []).length).toBe(11)
  })
  it('produces plausible activity levels across both halves of the group', async () => {
    const perWeek = (await database.query<{ rate: number }>(
      `select count(*)::numeric / (((now() at time zone 'Europe/Berlin')::date - date '2026-04-01') / 7.0) as rate
       from public.training_sessions group by user_id`)).rows.map((row) => Number(row.rate))
    expect(Math.max(...perWeek)).toBeLessThan(4)
    expect(perWeek.some((rate) => rate < 1.2)).toBe(true)
    expect(perWeek.some((rate) => rate > 1.5)).toBe(true)
  })
  it('refuses to seed twice', async () => {
    await expect(database.exec(withFlag(seed, true))).rejects.toThrow(/already exist/)
  })
  it('removes the seeded sessions again and keeps the accounts', async () => {
    await database.exec(unseed)
    expect(await count('select count(*) n from public.training_sessions')).toBe(0)
    expect(await count('select count(*) n from auth.users')).toBe(11)
  })
})

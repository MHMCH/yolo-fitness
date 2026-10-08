import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addUsers, authSchemaSql, createDatabase, migrations, readMigration } from './pgHelper'

const owner = '11111111-1111-4111-8111-111111111111'
const friend = '22222222-2222-4222-8222-222222222222'
const banned = '33333333-3333-4333-8333-333333333333'
const removed = '44444444-4444-4444-8444-444444444444'
const users = [
  { id: owner, name: 'Owner', email: 'owner@example.com' },
  { id: friend, name: 'Friend', email: 'friend@example.com' },
  { id: banned, name: 'Banned', bannedUntil: '2999-01-01' },
  { id: removed, name: 'Removed', deletedAt: '2020-01-01' },
]
const monthStart = `date_trunc('month', now() at time zone 'Europe/Berlin')::date`

describe('leaderboard, monthly and daily points', () => {
  let database: PGlite
  let asUser: Awaited<ReturnType<typeof createDatabase>>['asUser']
  beforeAll(async () => {
    const created = await createDatabase(users)
    database = created.database
    asUser = created.asUser
    // Sessions are added without a user token, like the SQL editor, so the month lock does not apply.
    await database.exec(`
      insert into public.training_sessions (id, user_id, trained_on) values
        ('a0000000-0000-4000-8000-000000000001', '${owner}', date '2020-01-05'),
        ('a0000000-0000-4000-8000-000000000002', '${owner}', date '2020-01-05'),
        ('a0000000-0000-4000-8000-000000000003', '${owner}', date '2020-01-20'),
        ('a0000000-0000-4000-8000-000000000004', '${friend}', date '2020-02-02'),
        ('a0000000-0000-4000-8000-000000000005', '${banned}', date '2020-01-06');
    `)
  }, 30_000)
  afterAll(async () => { await database?.close() })

  it('denies anonymous callers', async () => {
    for (const query of ['select * from public.leaderboard()', `select * from public.monthly_points('2020-01-01', '2020-02-01')`,
      `select * from public.daily_points('2020-01-01', '2020-02-01')`]) {
      await expect(asUser('anon', '', query)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('lists daily counts per active account as one row with parallel arrays', async () => {
    const result = await asUser('authenticated', friend, `select user_id, days::text[] as days, points from public.daily_points('2020-01-01', '2020-03-01') order by user_id`)
    expect(result.fields.map((field) => field.name)).toEqual(['user_id', 'days', 'points'])
    expect(result.rows).toEqual([
      { user_id: owner, days: ['2020-01-05', '2020-01-20'], points: [2, 1] },
      { user_id: friend, days: ['2020-02-02'], points: [1] },
    ])
  })
  it('includes accounts without sessions in the range and leaves out banned and removed ones', async () => {
    const result = await asUser('authenticated', friend, `select user_id, points from public.daily_points('2021-01-01', '2021-02-01') order by user_id`)
    expect(result.rows).toEqual([{ user_id: owner, points: [] }, { user_id: friend, points: [] }])
  })
  it('only counts the requested range, end exclusive', async () => {
    const result = await asUser('authenticated', friend, `select points from public.daily_points('2020-01-05', '2020-01-20') where user_id = '${owner}'`)
    expect(result.rows).toEqual([{ points: [2] }])
  })
  it('rejects reversed, missing and oversized ranges', async () => {
    for (const range of [`'2020-02-01', '2020-01-01'`, `'2020-01-01', '2021-06-01'`, `null, '2020-01-01'`, `'2020-01-01', null`]) {
      await expect(asUser('authenticated', friend, `select * from public.daily_points(${range})`)).rejects.toMatchObject({ code: '22023' })
    }
  })
  it('keeps the leaderboard and monthly points as the owner wrote them', async () => {
    const board = await asUser('authenticated', friend, 'select * from public.leaderboard() order by display_name')
    expect(board.fields.map((field) => field.name)).toEqual(['user_id', 'display_name', 'total_points', 'points_before_today'])
    expect(board.rows).toEqual([
      { user_id: friend, display_name: 'Friend', total_points: 1, points_before_today: 1 },
      { user_id: owner, display_name: 'Owner', total_points: 3, points_before_today: 3 },
    ])
    const monthly = await asUser('authenticated', friend, `select user_id, month::text, points from public.monthly_points('2020-01-01', '2020-02-01') order by user_id`)
    // monthly_points (unchanged) also counts banned accounts; leaderboard() and daily_points() leave them out.
    expect(monthly.rows).toEqual([{ user_id: owner, month: '2020-01-01', points: 3 }, { user_id: banned, month: '2020-01-01', points: 1 }])
  })
  it('still hides individual sessions from other accounts', async () => {
    expect((await asUser('authenticated', friend, `select * from public.training_sessions where user_id = '${owner}'`)).rows).toEqual([])
  })
})

describe('month lock', () => {
  let database: PGlite
  let asUser: Awaited<ReturnType<typeof createDatabase>>['asUser']
  beforeAll(async () => {
    const created = await createDatabase(users)
    database = created.database
    asUser = created.asUser
  }, 30_000)
  afterAll(async () => { await database?.close() })

  it('allows the current month', async () => {
    const result = await asUser('authenticated', owner,
      `insert into public.training_sessions(id, trained_on) values ('b0000000-0000-4000-8000-000000000001', ${monthStart}) returning user_id`)
    expect(result.rows).toEqual([{ user_id: owner }])
  })
  it('rejects adding a session to a closed month', async () => {
    await expect(asUser('authenticated', owner,
      `insert into public.training_sessions(id, trained_on) values ('b0000000-0000-4000-8000-000000000002', ${monthStart} - 1)`)).rejects.toMatchObject({ code: '23514' })
  })
  it('rejects deleting a session from a closed month, but lets the SQL editor fix it', async () => {
    await database.exec(`insert into public.training_sessions(id, user_id, trained_on) values ('b0000000-0000-4000-8000-000000000003', '${owner}', ${monthStart} - 1)`)
    await expect(asUser('authenticated', owner, `delete from public.training_sessions where id = 'b0000000-0000-4000-8000-000000000003'`)).rejects.toMatchObject({ code: '23514' })
    await database.exec(`delete from public.training_sessions where id = 'b0000000-0000-4000-8000-000000000003'`)
    expect((await database.query(`select count(*)::int as n from public.training_sessions where id = 'b0000000-0000-4000-8000-000000000003'`)).rows).toEqual([{ n: 0 }])
  })
  it('lets the owner delete a session of the current month', async () => {
    expect((await asUser('authenticated', owner, `delete from public.training_sessions where id = 'b0000000-0000-4000-8000-000000000001' returning id`)).rows).toHaveLength(1)
  })
})

describe('applying the migrations to an existing database', () => {
  const read = (file: string) => readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8')
  let database: PGlite
  const snapshot = async () => ({
    users: (await database.query('select id, raw_user_meta_data::text from auth.users order by id')).rows,
    sessions: (await database.query('select id, user_id, trained_on::text, created_at::text from public.training_sessions order by id')).rows,
  })
  beforeAll(async () => {
    database = new PGlite()
    await database.exec(authSchemaSql)
    await addUsers(database, users)
    await database.exec(await readMigration(migrations[0]))
    await database.exec(`insert into public.training_sessions (id, user_id, trained_on) values
      ('c0000000-0000-4000-8000-000000000001', '${owner}', date '2026-10-01'), ('c0000000-0000-4000-8000-000000000002', '${friend}', date '2026-10-02')`)
  }, 30_000)
  afterAll(async () => { await database?.close() })

  it('leaves existing sessions and accounts untouched and can be run again', async () => {
    const before = await snapshot()
    for (const round of [1, 2]) {
      for (const file of migrations.slice(1)) await database.exec(await readMigration(file))
      expect(await snapshot(), `round ${round}`).toEqual(before)
    }
  })
  it('creates no tables or columns', async () => {
    const tables = (await database.query<{ name: string }>(`select table_name as name from information_schema.tables where table_schema = 'public' order by 1`)).rows
    expect(tables.map((row) => row.name)).toEqual(['training_sessions'])
  })
  it('can be rolled back without touching sessions or accounts', async () => {
    const before = await snapshot()
    await database.exec(await read('rollback/202610070001_month_lock_and_daily_points_down.sql'))
    expect(await snapshot()).toEqual(before)
    expect((await database.query(`select count(*)::int as n from pg_proc where proname in ('enforce_open_month', 'daily_points')`)).rows).toEqual([{ n: 0 }])
    // The leaderboard functions of the first league migration stay, and old behaviour is back: free backdating.
    expect((await database.query(`select count(*)::int as n from pg_proc where proname in ('leaderboard', 'monthly_points')`)).rows).toEqual([{ n: 2 }])
    await database.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`)
    await database.exec(`insert into public.training_sessions(id, trained_on) values ('c0000000-0000-4000-8000-000000000009', date '2026-01-01')`)
    await database.exec('reset role; reset request.jwt.claim.sub;')
  })
})

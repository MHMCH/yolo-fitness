import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Upgrades a database that already holds data from the first migration and checks that nothing is changed.
const users = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Anna', created: '2026-09-01' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'anna', created: '2026-09-02' },  // same name, ignoring case
  { id: '33333333-3333-4333-8333-333333333333', name: undefined, created: '2026-09-03' },
]
const read = (file: string) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')

describe('upgrading an existing database with the season migration', () => {
  let database: PGlite
  let before: { users: unknown; sessions: unknown }
  const snapshot = async () => ({
    users: (await database.query('select id, raw_user_meta_data::text, created_at::text from auth.users order by id')).rows,
    sessions: (await database.query('select id, user_id, trained_on::text, created_at::text from public.training_sessions order by id')).rows,
  })
  beforeAll(async () => {
    database = new PGlite()
    await database.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}', created_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `)
    for (const user of users) {
      await database.query('insert into auth.users (id, raw_user_meta_data, created_at) values ($1, $2, $3)',
        [user.id, JSON.stringify(user.name ? { display_name: user.name } : {}), user.created])
    }
    await database.exec(await read('202610040001_training.sql'))
    await database.exec(`
      insert into public.training_sessions (id, user_id, trained_on) values
        ('a0000000-0000-4000-8000-000000000001', '${users[0].id}', date '2026-10-01'),
        ('a0000000-0000-4000-8000-000000000002', '${users[0].id}', date '2026-10-02'),
        ('a0000000-0000-4000-8000-000000000003', '${users[1].id}', date '2026-10-02');
    `)
    before = await snapshot()
    await database.exec(await read('202610070001_season.sql'))
  }, 30_000)
  afterAll(async () => { await database?.close() })

  it('leaves every existing session and account exactly as it was', async () => {
    expect(await snapshot()).toEqual(before)
  })
  it('creates no teams or team members', async () => {
    expect((await database.query('select count(*)::int as n from public.teams')).rows).toEqual([{ n: 0 }])
    expect((await database.query('select count(*)::int as n from public.team_members')).rows).toEqual([{ n: 0 }])
  })
  it('gives every existing account a profile, keeping the earliest of two equal names', async () => {
    const rows = (await database.query<{ user_id: string; display_name: string | null; is_admin: boolean }>(
      'select user_id, display_name, is_admin from public.profiles order by user_id')).rows
    expect(rows).toEqual([
      { user_id: users[0].id, display_name: 'Anna', is_admin: false },
      { user_id: users[1].id, display_name: null, is_admin: false },
      { user_id: users[2].id, display_name: null, is_admin: false },
    ])
  })
  it('does not make anyone an administrator', async () => {
    expect((await database.query('select count(*)::int as n from public.profiles where is_admin')).rows).toEqual([{ n: 0 }])
  })
  it('ranks individuals and returns empty team results while no teams exist', async () => {
    const ranking = (await database.query<{ display_name: string; sessions: number; rank: number }>(
      `select display_name, sessions::int as sessions, rank from private.season_ranking(date '2026-10-07')`)).rows
    expect(ranking).toEqual([
      { display_name: 'Anna', sessions: 2, rank: 1 },
      { display_name: 'Unnamed', sessions: 1, rank: 2 },
      { display_name: 'Unnamed', sessions: 0, rank: 3 },
    ])
    for (const query of [`select * from private.team_month_standings(date '2026-10-07', 1, 1)`,
      `select * from private.team_quarter_standings(date '2026-10-07', 1)`,
      `select * from private.team_daily_counts(date '2026-10-07', 1, 1)`]) {
      expect((await database.query(query)).rows).toEqual([])
    }
    expect((await database.query(`select count(*)::int as n from private.season_daily_counts(date '2026-10-07')`)).rows).toEqual([{ n: 3 }])
  })
  it('still creates a profile when a new account uses a name that is already taken', async () => {
    const id = '44444444-4444-4444-8444-444444444444'
    await database.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"display_name":"ANNA"}')`, [id])
    expect((await database.query('select display_name from public.profiles where user_id = $1', [id])).rows).toEqual([{ display_name: null }])
  })
})

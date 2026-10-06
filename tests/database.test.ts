import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('PostgreSQL migration and ownership enforcement', () => {
  let database: PGlite
  const owner = '11111111-1111-4111-8111-111111111111'
  const friend = '22222222-2222-4222-8222-222222222222'
  const banned = '33333333-3333-4333-8333-333333333333'
  const firstEntry = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  beforeAll(async () => {
    database = new PGlite()
    await database.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}',
        banned_until timestamptz, deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema auth to authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users (id, email, raw_user_meta_data, banned_until) values
        ('${owner}', 'owner@example.com', '{"display_name": "Owner"}', null),
        ('${friend}', 'friend@example.com', '{"display_name": "Friend"}', null),
        ('${banned}', 'banned@example.com', '{"display_name": "Banned"}', now() + interval '1 day');
    `)
    for (const migration of ['202610040001_training.sql', '202610060001_leaderboard.sql']) {
      await database.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'))
    }
  }, 30_000)
  afterAll(async () => { await database?.close() })
  async function asUser(role: 'anon' | 'authenticated', identity: string, query: string) {
    try {
      await database.exec(`set role ${role}; set request.jwt.claim.sub = '${identity}';`)
      return await database.query(query)
    } finally { await database.exec('reset role; reset request.jwt.claim.sub;') }
  }
  it('denies anonymous reads, writes and summary calls', async () => {
    for (const query of ['select * from public.training_sessions',
      `insert into public.training_sessions(id) values ('${firstEntry}')`,
      'delete from public.training_sessions', 'select * from public.training_summary()']) {
      await expect(asUser('anon', '', query)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('derives ownership, database timestamp and Berlin date', async () => {
    const result = await asUser('authenticated', owner,
      `insert into public.training_sessions(id) values ('${firstEntry}') returning user_id, trained_on = (now() at time zone 'Europe/Berlin')::date as correct_date, created_at <= now() as server_timestamp`)
    expect(result.rows).toEqual([{ user_id: owner, correct_date: true, server_timestamp: true }])
  })
  it('allows multiple same-day rows and counts only the caller', async () => {
    await asUser('authenticated', owner, `insert into public.training_sessions(id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')`)
    const own = await asUser('authenticated', owner, 'select month_count, total_count from public.training_summary()')
    const other = await asUser('authenticated', friend, 'select month_count, total_count from public.training_summary()')
    expect(own.rows).toEqual([{ month_count: 2, total_count: 2 }])
    expect(other.rows).toEqual([{ month_count: 0, total_count: 0 }])
  })
  it('blocks forged owner, timestamp and all updates', async () => {
    for (const query of [
      `insert into public.training_sessions(id, user_id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${friend}')`,
      `insert into public.training_sessions(id, created_at) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', now())`,
      `update public.training_sessions set trained_on = date '2020-01-01' where id = '${firstEntry}'`,
    ]) await expect(asUser('authenticated', owner, query)).rejects.toMatchObject({ code: '42501' })
  })
  it('accepts past dates and rejects future dates', async () => {
    const result = await asUser('authenticated', owner,
      `insert into public.training_sessions(id, trained_on) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', date '2020-01-01') returning trained_on::text`)
    expect(result.rows).toEqual([{ trained_on: '2020-01-01' }])
    await expect(asUser('authenticated', owner,
      `insert into public.training_sessions(id, trained_on) values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', (now() at time zone 'Europe/Berlin')::date + 1)`)).rejects.toMatchObject({ code: '23514' })
  })
  it('prevents another account reading or deleting known row IDs', async () => {
    expect((await asUser('authenticated', friend, 'select * from public.training_sessions')).rows).toEqual([])
    expect((await asUser('authenticated', friend, `delete from public.training_sessions where id = '${firstEntry}' returning id`)).rows).toEqual([])
    expect((await asUser('authenticated', owner, `select id from public.training_sessions where id = '${firstEntry}'`)).rows).toEqual([{ id: firstEntry }])
  })
  it('database primary key guarantees request deduplication', async () => {
    await expect(asUser('authenticated', owner, `insert into public.training_sessions(id) values ('${firstEntry}')`)).rejects.toMatchObject({ code: '23505' })
    expect((await asUser('authenticated', owner, `select count(*) from public.training_sessions where id = '${firstEntry}'`)).rows).toEqual([{ count: 1 }])
  })
  it('allows the owner to delete and recalculates counts', async () => {
    expect((await asUser('authenticated', owner, `delete from public.training_sessions where id = '${firstEntry}' returning id`)).rows).toEqual([{ id: firstEntry }])
    expect((await asUser('authenticated', owner, 'select month_count, total_count from public.training_summary()')).rows).toEqual([{ month_count: 1, total_count: 2 }])
  })
  it('denies anonymous leaderboard and monthly point calls', async () => {
    for (const query of ['select * from public.leaderboard()', `select * from public.monthly_points('2020-01-01', '2020-02-01')`]) {
      await expect(asUser('anon', '', query)).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('leaderboard exposes only aggregates and names of active accounts', async () => {
    const result = await asUser('authenticated', friend, 'select * from public.leaderboard() order by display_name')
    expect(result.fields.map((field) => field.name)).toEqual(['user_id', 'display_name', 'total_points', 'points_before_today'])
    expect(result.rows).toEqual([
      { user_id: friend, display_name: 'Friend', total_points: 0, points_before_today: 0 },
      { user_id: owner, display_name: 'Owner', total_points: 2, points_before_today: 1 },
    ])
  })
  it('returns monthly point aggregates for a bounded range', async () => {
    const result = await asUser('authenticated', friend, `select user_id, month::text, points from public.monthly_points('2020-01-01', '2020-02-01')`)
    expect(result.rows).toEqual([{ user_id: owner, month: '2020-01-01', points: 1 }])
    for (const range of [`'2020-02-01', '2020-01-01'`, `'2020-01-01', '2021-06-01'`, `null, '2020-01-01'`]) {
      await expect(asUser('authenticated', friend, `select * from public.monthly_points(${range})`)).rejects.toMatchObject({ code: '22023' })
    }
  })
  it('still hides individual sessions from other accounts', async () => {
    expect((await asUser('authenticated', friend, 'select * from public.training_sessions')).rows).toEqual([])
  })
})
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase } from './pgHelper'

describe('PostgreSQL migration and ownership enforcement', () => {
  let database: PGlite
  const owner = '11111111-1111-4111-8111-111111111111'
  const friend = '22222222-2222-4222-8222-222222222222'
  const firstEntry = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let asUser: Awaited<ReturnType<typeof createDatabase>>['asUser']
  beforeAll(async () => {
    const created = await createDatabase([{ id: owner, name: 'Owner' }, { id: friend, name: 'Friend' }])
    database = created.database
    asUser = created.asUser
  }, 30_000)
  afterAll(async () => { await database?.close() })
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
      `update public.training_sessions set trained_on = date '2026-10-01' where id = '${firstEntry}'`,
    ]) await expect(asUser('authenticated', owner, query)).rejects.toMatchObject({ code: '42501' })
  })
  it('accepts past dates and rejects future dates', async () => {
    const result = await asUser('authenticated', owner,
      `insert into public.training_sessions(id, trained_on) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', date_trunc('month', now() at time zone 'Europe/Berlin')::date) returning trained_on = date_trunc('month', now() at time zone 'Europe/Berlin')::date as month_start`)
    expect(result.rows).toEqual([{ month_start: true }])
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
    expect((await asUser('authenticated', owner, 'select month_count, total_count from public.training_summary()')).rows).toEqual([{ month_count: 2, total_count: 2 }])
  })
})
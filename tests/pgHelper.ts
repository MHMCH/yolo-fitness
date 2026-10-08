import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const migrations = [
  '202610040001_training.sql',
  '202610060001_leaderboard.sql',
  '202610070001_month_lock_and_daily_points.sql',
]

export const authSchemaSql = `
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}',
    banned_until timestamptz, deleted_at timestamptz, created_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`

export const readMigration = (file: string) => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')

export type TestUser = { id: string; name?: string; email?: string; metadata?: Record<string, unknown>; bannedUntil?: string; deletedAt?: string }

export async function addUsers(database: PGlite, users: TestUser[]) {
  for (const user of users) {
    const metadata = { ...(user.name ? { display_name: user.name } : {}), ...user.metadata }
    await database.query(
      'insert into auth.users (id, email, raw_user_meta_data, banned_until, deleted_at) values ($1, $2, $3, $4, $5)',
      [user.id, user.email ?? null, JSON.stringify(metadata), user.bannedUntil ?? null, user.deletedAt ?? null])
  }
}

export async function createDatabase(users: TestUser[], options: { migrations?: string[] } = {}) {
  const database = new PGlite()
  await database.exec(authSchemaSql)
  await addUsers(database, users)
  for (const file of options.migrations ?? migrations) await database.exec(await readMigration(file))
  async function asUser(role: 'anon' | 'authenticated', identity: string, query: string) {
    try {
      await database.exec(`set role ${role}; set request.jwt.claim.sub = '${identity}';`)
      return await database.query<Record<string, unknown>>(query)
    } finally { await database.exec('reset role; reset request.jwt.claim.sub;') }
  }
  return { database, asUser }
}

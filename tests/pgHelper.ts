import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

export const migrations = ['202610040001_training.sql', '202610070001_season.sql', '202610070002_features_unlock.sql']

export async function createDatabase(users: Array<{ id: string; name?: string }>) {
  const database = new PGlite()
  await database.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb not null default '{}',
      instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
      created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb,
      confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `)
  for (const user of users) {
    await database.query('insert into auth.users (id, raw_user_meta_data) values ($1, $2)',
      [user.id, JSON.stringify(user.name ? { display_name: user.name } : {})])
  }
  for (const file of migrations) {
    await database.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
  }
  // A season covering today (the real one ends in 2027) and a fixed one for date-controlled tests.
  await database.exec(`
    insert into public.seasons (name, starts_on)
    values ('Test current', date_trunc('month', now() at time zone 'Europe/Berlin')::date),
           ('Test fixed', date '2020-10-01')
    on conflict do nothing;
  `)
  async function asUser(role: 'anon' | 'authenticated', identity: string, query: string) {
    try {
      await database.exec(`set role ${role}; set request.jwt.claim.sub = '${identity}';`)
      return await database.query<Record<string, unknown>>(query)
    } finally { await database.exec('reset role; reset request.jwt.claim.sub;') }
  }
  return { database, asUser }
}

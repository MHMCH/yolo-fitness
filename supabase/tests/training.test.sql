begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'friend@example.com');

select ok((select relrowsecurity from pg_class where oid = 'public.training_sessions'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.training_sessions', 'SELECT'), 'anonymous has no read grant');
select ok(not has_table_privilege('authenticated', 'public.training_sessions', 'UPDATE'), 'no update grant');
select ok(not has_column_privilege('authenticated', 'public.training_sessions', 'user_id', 'INSERT'), 'cannot supply owner');
select ok(not has_column_privilege('authenticated', 'public.training_sessions', 'created_at', 'INSERT'), 'cannot supply timestamp');

set local role anon;
select throws_ok($$select * from public.training_sessions$$, '42501', null, 'anonymous read denied');
select throws_ok($$insert into public.training_sessions(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'anonymous insert denied');
select throws_ok($$delete from public.training_sessions$$, '42501', null, 'anonymous delete denied');
select throws_ok($$select * from public.training_summary()$$, '42501', null, 'anonymous summary denied');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select results_eq(
  $$insert into public.training_sessions(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') returning user_id$$,
  array['11111111-1111-4111-8111-111111111111'::uuid], 'insert derives owner from identity');
select results_eq(
  $$insert into public.training_sessions(id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') returning trained_on$$,
  array[(now() at time zone 'Europe/Berlin')::date], 'multiple daily sessions allowed; date defaults to Berlin');
select results_eq($$select total_count from public.training_summary()$$, array[2::bigint], 'owner summary counts own rows');
select throws_ok(
  $$insert into public.training_sessions(id, trained_on) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', (now() at time zone 'Europe/Berlin')::date + 1)$$,
  '23514', null, 'future dates rejected');
select throws_ok(
  $$insert into public.training_sessions(id, user_id) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'forged ownership rejected');
select throws_ok($$update public.training_sessions set trained_on = date '2020-01-01'$$, '42501', null, 'all client updates rejected');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is_empty($$select * from public.training_sessions$$, 'friend cannot read owner rows');
select is_empty($$delete from public.training_sessions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id$$, 'friend cannot delete owner row');

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
select results_eq($$select count(*) from public.training_sessions$$, array[2::bigint], 'denied writes left owner rows intact');
select results_eq(
  $$delete from public.training_sessions where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id$$,
  array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid], 'owner can delete own session');

select * from finish();
rollback;
create table public.training_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trained_on date not null default (now() at time zone 'Europe/Berlin')::date,
  created_at timestamptz not null default now(),
  constraint training_date_valid check (
    trained_on >= date '0001-01-01'
    and trained_on <= (now() at time zone 'Europe/Berlin')::date
  )
);

create index training_sessions_user_date_idx on public.training_sessions (user_id, trained_on desc);
alter table public.training_sessions enable row level security;
revoke all on public.training_sessions from anon, authenticated;
grant select, delete on public.training_sessions to authenticated;
grant insert (id, trained_on) on public.training_sessions to authenticated;

create policy training_select_own on public.training_sessions
  for select to authenticated using (user_id = (select auth.uid()));
create policy training_insert_own on public.training_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy training_delete_own on public.training_sessions
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.training_summary()
returns table (today date, month_count bigint, total_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (now() at time zone 'Europe/Berlin')::date as today,
    count(*) filter (where trained_on >= date_trunc('month', now() at time zone 'Europe/Berlin')::date
      and trained_on < (date_trunc('month', now() at time zone 'Europe/Berlin') + interval '1 month')::date) as month_count,
    count(*) as total_count
  from public.training_sessions;
$$;

revoke all on function public.training_summary() from public, anon;
grant execute on function public.training_summary() to authenticated;
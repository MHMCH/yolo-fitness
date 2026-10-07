-- Records when an account unlocked the season screens (null = still hidden). This is a UI gimmick,
-- not an access control: the data itself is governed by the earlier migrations.
-- Existing profiles stay null, so everyone sees the unlock celebration with their next confirmed session.
alter table public.profiles add column features_unlocked_at timestamptz;
grant update (features_unlocked_at) on public.profiles to authenticated;

-- DEVELOPMENT ONLY. Removes the sessions dev-seed.sql created (created_at = trained_on 12:00:00 UTC exactly).
-- The u1..u11 accounts and the names, last-year counts and unlock flags stored in their metadata are left as they
-- are; reset the unlock flag of an account with:
--   update auth.users set raw_user_meta_data = raw_user_meta_data - 'features_unlocked_at' where email = '...';
do $unseed$
begin
  delete from public.training_sessions where created_at = ((trained_on + time '12:00') at time zone 'UTC');
end;
$unseed$;

-- Undo 202610070002_features_unlock.sql (run this before 202610070001_season_down.sql if you need both).
-- Only the unlock timestamps are lost; with the column gone, everyone sees all screens again after a
-- frontend from before the unlock feature is deployed.
begin;
alter table public.profiles drop column if exists features_unlocked_at;
commit;

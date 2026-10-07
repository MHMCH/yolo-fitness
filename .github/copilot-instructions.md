# Project Conventions

- Vue 3, TypeScript, Vite; static GitHub Pages hosting.
- Supabase password accounts are personally provisioned; no SMTP or public signup.
- Keep privileged keys and admin utilities out of the frontend bundle.
- Database grants and RLS enforce ownership of `training_sessions`; other people's session rows are never readable. Display names confer no permissions; only `profiles.is_admin` does, and it is set only in SQL.
- Rankings and team standings come from the aggregate functions in `supabase/migrations/202610070001_season.sql` (security definer, counts and names only, delegating to the unexposed `private` schema). Do not add functions or views that return another user's session rows.
- Calendar dates, months, quarters and the month lock use Europe/Berlin. Clients may only add or delete sessions in the current monthly period.
- No offline writes or custom action artwork. Session sound plays only after confirmed saves and can be disabled.
- `supabase/dev/` holds scripts for TEST projects only. Never run them on production and keep the committed `v_is_test_db` flag `false`.
- Schema changes go in a new migration (applied before the frontend that needs it), with PGlite tests in `tests/`.
- Validate changes with npm test and npm run build.

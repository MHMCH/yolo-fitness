# Project Conventions

- Vue 3, TypeScript, Vite; static GitHub Pages hosting.
- Supabase password accounts are personally provisioned; no SMTP or public signup.
- Keep privileged keys and admin utilities out of the frontend bundle.
- Database grants and RLS enforce ownership of `training_sessions`; other people's session rows are never readable. Display names and other account metadata confer no permissions.
- Leaderboard and league are allowed: they read only aggregates through the security-definer functions (`leaderboard`, `monthly_points`, `daily_points`: names, counts and per-day totals, never session rows). Do not add functions or views that return another user's session rows. Teams and the season start are listed in `src/config/` (account ids, never emails; the file ships in the public bundle).
- Calendar dates, months, quarters and the month lock use Europe/Berlin. Clients may only add or delete sessions in the current month.
- No offline writes or custom action artwork. Session sound plays only after confirmed saves and can be disabled.
- `supabase/dev/` holds scripts for TEST projects only. Never run them on production and keep the committed `v_is_test_db` flag `false`. `src/config/local.ts` is a git-ignored, dev-server-only override.
- Keep the database small: schema changes go in a new additive, re-runnable migration with PGlite tests in `tests/`, applied before the frontend that needs it.
- `src/config/release.ts` holds a temporary release guard (`requireTestMode`): while true, the new screens stay off unless a browser turned on test mode. Remove the guard when the release is final.
- Validate changes with npm test and npm run build.

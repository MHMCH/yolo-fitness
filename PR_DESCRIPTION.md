## Season challenge: Leaderboard, League, charts and month lock

Combines the `feature/leaderboard-league` work with the season screens built on top of it. The league maths, team configuration, medals, rank arrows, quarter champions and the Leaderboard/League names and rules are the owner's. On top of that: charts, a quarter/month browser, a month lock, an unlock celebration, chat-style copy, swiping between tabs and a few quality-of-life fixes. Merging releases it: each account sees a celebration with its next confirmed session.

### What users get
- **Home:** season chart with the personal curve, the goal of 100 sessions and last year's count; slide a finger over it for exact values. Street-style greeting by weekday and time of day.
- **Leaderboard** (the owner's rules): season totals with gold/silver/bronze medals, shared places, rank arrows since yesterday, a chart where you and your direct rivals (one above, one below) are coloured, tap-to-highlight, copy.
- **League** (the owner's rules): quarters and months to browse, live standings with the bonus a team would get if the month ended now, final results with bonus for closed months, quarter totals with the monthly results, per-team charts, quarter champions, copy.
- **Copy:** structured Markdown for pasting into an AI prompt (rules first, explicit words and numbers, derived facts such as last 7 days, gaps, weekly streaks and who overtook whom), the same for everybody and with first names and counts only, confirmed by a toast and a check icon. This replaces the owner's table-text export.
- **Account:** last year's sessions.
- **Month lock:** sessions can only be added or deleted in the **current** month, so closed months (and the standings calculated from them) cannot change.
- **Unlock surprise:** the new screens are hidden until each account's next confirmed session, which shows a fullscreen celebration with the "Yeah Buddy" sticker, confetti and stars. Stored per account; UI only.
- **Navigation:** a tab bar fixed at the bottom; swipe sideways to change tabs (not on charts, fields or screen edges); confirmations and errors appear as a toast under the top bar and as a check mark on the plus, because the old status line sat below the fold.

### Release
Everybody sees the celebration with their next confirmed session, which unlocks the new screens for that account (stored in the account metadata, UI only). `streetGreetings = false` in `src/config/release.ts` switches the greetings off on their own. The bottom bar is now a fixed tab bar with Home and Account, and Session history is a button on Home.

### Design
- **Teams stay in `src/config/league.ts`** (by account id, calendar quarters) and **all standings are calculated in the browser** with the owner's league maths. No team, profile or admin tables.
- Display name, last year's count and the unlock flag live in the **account metadata**, as the display name always did.
- Ranking rules are the owner's: ties share the place and the next place follows directly, so no medal or bonus is skipped (1, 1, 2, 3; bonus +3, +3, +2, +1; this changes the owner's earlier 1, 1, 3 rule and should be agreed with them), a team without sessions gets no bonus, the running month shows its provisional bonus.
- The season start is `src/config/season.ts`. A git-ignored `src/config/local.ts` lets a test project use its own ids and an earlier season start. `npm run rehearsal` builds the production build with it into a separate folder (no service worker) and serves it on the network; the deployment build never contains it.

### Database
No tables or columns are created; both migrations are **re-runnable**.
- `202610060001_leaderboard.sql` (the owner's): the two functions now use `create or replace` so the file is safe to run whether or not it already ran. The app no longer calls `monthly_points`, it stays for compatibility.
- `202610070001_month_lock_and_daily_points.sql` (new): the month-lock trigger and `daily_points(from, to)`, one row per active account with parallel arrays of training days and session counts (aggregate, never session rows; executable only by signed-in users; deleted and banned accounts excluded).

Privacy is unchanged in kind: raw sessions stay readable only by their owner, everyone sees names, season totals, per-day totals and team scores. Behaviour change for users: after the migration, backdating into closed months and deleting sessions from them is rejected.

### Deployment order (data first)
1. **Back up** the sessions: in the SQL editor run `select * from public.training_sessions;` and export the result as CSV, and `select id, raw_user_meta_data from auth.users;` (keep it out of git). Note `select count(*) from public.training_sessions;` and `select count(*) from auth.users;`.
2. **`src/config/league.ts` carries the real account ids** (the owner's "fixed uuids" commit). A test (`tests/leagueConfig.test.ts`) fails on placeholders, duplicates, missing quarters or inconsistent teams, so a wrong file cannot be deployed. Never use emails there.
3. **Run the migrations before merging**, in one transaction: `begin;`, the content of `supabase/migrations/202610060001_leaderboard.sql`, the content of `supabase/migrations/202610070001_month_lock_and_daily_points.sql`, `commit;`. They only create functions and a trigger, so this is safe whether or not the leaderboard migration ran before.
4. **Check:** both counts are unchanged; `select proname from pg_proc where proname in ('leaderboard', 'monthly_points', 'daily_points');` lists three functions; `select count(*) from auth.users where raw_user_meta_data ? 'features_unlocked_at';` is 0; calling `/rest/v1/rpc/daily_points` with only the publishable key and no login is refused.
5. **Merge** to `main`; the Pages workflow runs the tests and deploys. Installed apps show "Update available" and need a tap on **Update**. Each account sees the celebration with its next confirmed session.

The old frontend keeps working after step 3 (apart from the month lock), so there is no rush between steps 3 and 5.

### Rollback
`supabase/rollback/202610070001_month_lock_and_daily_points_down.sql` removes the trigger and the new function and leaves `training_sessions` and `auth.users` untouched (tested). Then redeploy the previous frontend (revert the merge).

### Testing
- `npm test` (161 tests): the owner's league maths and clipboard tests, the league configuration guard, rival selection, chart, team, greeting, swipe and chat-text logic, the unlock logic, and the real migrations in embedded PostgreSQL: grants and RLS, month lock, aggregate functions, **applying the migrations to a database that already holds data (sessions and accounts unchanged, no new tables, running them twice)**, the rollback, and the dev seed scripts.
- `npm run typecheck`, `npm run build`, and every screen was checked in the local demo preview, including phone-sized windows.
- Not verified here: the migrations and the app against the production project, real-device PWA behaviour (installed app, iPhone safe areas, swipe feel), and that the account metadata keys (name, last year's count, unlock flag) do not overwrite each other when saved, which should be confirmed once on a test project.

### Docs
README, FRIENDS.md and the project conventions describe the season, privacy, month lock, configuration, the release, the dev and rehearsal scripts and the seed scripts (`supabase/dev/`, test projects only).

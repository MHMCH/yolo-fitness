# Release checklist (temporary; remove it with `git rm RELEASE_CHECKLIST.md PR_DESCRIPTION.md` after the release)

Who: **you** push and merge on GitHub; **together with the owner** you run the SQL on the production project.
Rule of thumb: database first, then merge. Nothing here changes data; the migrations only add functions and a trigger.

## A. Before release day

1. **Rehearsal on the test project** (your PC)
   - [ ] Test project has both migrations (`202610060001_leaderboard.sql`, `202610070001_month_lock_and_daily_points.sql`) and your `src/config/local.ts` exists.
   - [ ] `npm run rehearsal`, open the printed address on the phone. This is the real production build with the release guard on.
   - [ ] Guard off (no taps): only Home and Account tabs; a session shows no celebration.
   - [ ] Five taps on "Connected": badge, flash/vibration. Log a session: celebration, then Leaderboard and League appear, League shows real names.
   - [ ] Five taps again: new features hidden, unlock reset.
   - [ ] Metadata check (SQL editor of the test project): enter last year's sessions in Account, save, then
     ```sql
     select email, raw_user_meta_data from auth.users where email = 'u1@test.test';
     ```
     `display_name`, `last_year_count` and `features_unlocked_at` must all be present together.
   - [ ] Month lock: adding a past session outside the current month is refused.
2. **Push and open the PR**
   - [ ] `git push -u origin feature/season-league`, open the PR against `main`, paste `PR_DESCRIPTION.md`.
   - [ ] The owner reviews. Suggest **Squash and merge** (34 small commits become one; co-authors stay in the message).
3. **GitHub settings** (owner)
   - [ ] Repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` point to **production** (Settings > Secrets and variables > Actions > Variables).
   - [ ] Pages source is "GitHub Actions".

## B. Release day (pick a quiet time, not around midnight on the last day of a month)

1. **Back up** (production SQL editor, export each result as CSV, keep out of git)
   ```sql
   select * from public.training_sessions;
   select id, raw_user_meta_data from auth.users;
   select count(*) from public.training_sessions;   -- write this number down
   select count(*) from auth.users;                  -- write this number down
   ```
   Also note the current `main` commit: `0f72d4c` (revert the merge later to get the old site back).
2. **Run the migrations in one transaction** (production SQL editor): paste
   ```
   begin;
   <content of supabase/migrations/202610060001_leaderboard.sql>
   <content of supabase/migrations/202610070001_month_lock_and_daily_points.sql>
   commit;
   ```
   If anything errors, run `rollback;` and stop.
3. **Verify**
   ```sql
   select count(*) from public.training_sessions;                       -- same number as before
   select count(*) from auth.users;                                      -- same number as before
   select proname from pg_proc where proname in ('leaderboard','monthly_points','daily_points');   -- 3 rows
   select count(*) from auth.users where raw_user_meta_data ? 'features_unlocked_at';              -- 0
   ```
   Anonymous call must be refused (replace the placeholders; the publishable key is public):
   ```bash
   curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/daily_points" -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" -d '{"from_date":"2026-10-01","to_date":"2026-11-01"}'
   ```
4. **Merge the PR.** Watch the Actions run (tests, build, deploy). Open the site: sign in, check the plain Home (greeting "Hey, name.", fixed Home/Account tab bar). Users will see "Update available" and tap **Update**.
5. **Test in production** (your phone, your real account)
   - [ ] Five taps on "Connected": test mode on. Log a session (it is real data; delete it afterwards in Session history, the current month is still open).
   - [ ] Celebration, Leaderboard (11 names), League (real team names, colours, bonus chips), Home chart, last year's field.
   - [ ] Check in SQL: `select raw_user_meta_data from auth.users where email = '<yours>';` shows `display_name`, `last_year_count`, `features_unlocked_at`.
   - [ ] Five taps again: everything hidden again, unlock reset.
6. **Final release** (second PR, small): set `requireTestMode = false` in `src/config/release.ts`, then delete the guard (files and lines listed in the README, section "Season, Leaderboard And League", Release guard; `release.ts` itself stays because it also holds `streetGreetings`). Merge. Everybody sees the surprise with their next session.

## C. If something goes wrong

| Problem | Action |
| --- | --- |
| Migration error | `rollback;`, nothing changed. Send the error text. |
| Site broken after merge | Revert the merge commit on `main`; Pages redeploys the old site. The database changes can stay (old app works with them, apart from the month lock). |
| Month lock blocks a legitimate entry | Add or delete the session in the SQL editor (the lock does not apply there). |
| Want the database changes gone | Run `supabase/rollback/202610070001_month_lock_and_daily_points_down.sql`. Sessions and accounts are untouched. |
| Data worry | Restore from the CSV exports of step B1. |

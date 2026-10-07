# yolo-fitness

A private training log built with Vue 3, TypeScript and Vite. GitHub Pages serves the static PWA; managed Supabase Auth and Postgres provide accounts and data enforcement. There is no custom application backend or email service. The installed app is named **yolo-fitness**, with a rounded pink plus on a near-black icon.

Accounts use an email identifier and a personally delivered password. There is no self-signup, invitation email, OTP, email recovery or password-change UI. The organizer provisions and recovers accounts. Individual training sessions are private between ordinary accounts, not from the Supabase project administrator. The leaderboard and league expose **aggregates only** (names, counts and per-day totals, never another person's session rows); see [Season, Leaderboard And League](#season-leaderboard-and-league).

The app is built for a yearly **season challenge** among friends: log sessions with the big plus, follow your own progress toward 100 sessions and last year's count, compare yourself on the **Leaderboard**, and follow the quarterly team **League**. A season is one year starting on the date in `src/config/season.ts` (2026-10-01 for the first one).

Confirmed session saves play `public/session-logged.mp3` using Web Audio, unlocked by the logging gesture. **Account > Session sound** controls playback and remembers the preference on this device. Audio is enabled by default; browser/device restrictions can still silence it. Failed audio never blocks logging. The MP3 is included in the PWA asset cache, not in Supabase; replacing it requires a new build/deployment.

## Local Setup

1. Install Node **22.12 or newer** and npm. From the repository root run `npm ci` (the committed lockfile is required).
2. To work without live credentials, run `npm run dev` and open the URL it prints. Leave Supabase configuration unset: the setup screen offers **Local preview**, using memory only with no Supabase requests. Preview entries disappear when reloaded/exited; this button is development-only and absent from production builds.
3. For a real project, copy `.env.example` to an ignored `.env.local` and replace the placeholders:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
   VITE_BASE_PATH=/
   ```

4. Restart the dev server after changing environment variables. Only these public Vite values belong in frontend configuration. Never put an admin secret or legacy `service_role` key in any `VITE_*` variable, source, git, `dist`, Pages variables or CI.

Commands from the current package scripts:

```sh
npm run dev
npm run typecheck
npm test
npm run icons
npm run build
npm run preview
```

`icons` regenerates the raster app icons. `build` runs typechecking then Vite and produces `dist`; `preview` serves that production build locally, without the development demo. `npm test` includes calendar/retry/state tests, chart, ranking and team-logic tests, and executes the actual migrations and the development seed scripts in embedded PostgreSQL (PGlite) with simulated Supabase Auth identities, checking grants, RLS, the month lock and the aggregate functions without Docker. This verifies SQL enforcement but does not verify hosted Auth, PostgREST integration or your project's settings. There are no offline writes; cached PWA assets do not make Supabase available offline.

## Supabase Project

1. Create a Supabase project, choosing a nearby **Europe region** for your users. Store its database password securely. Region selection does not define the calendar timezone: the database uses **Europe/Berlin**, including daylight saving time.
2. In the project's SQL Editor, execute the complete contents of the files in `supabase/migrations/` **in filename order**: first `202610040001_training.sql`, then `202610060001_leaderboard.sql`, then `202610070001_month_lock_and_daily_points.sql`. The last two only create functions and a trigger (no tables or columns) and are safe to run again, so run both on a database whether or not an earlier version of them ran. Apply a new migration **before** deploying the frontend that needs it. Keep the migrations in version control; use subsequent migrations for later schema changes rather than blindly rerunning `202610040001_training.sql`.
3. Obtain the project URL and **publishable** API key from the project's connection/API settings (dashboard labels may vary). Use them in the public environment variables above. A legacy `anon` key is also public; neither public key replaces grants and RLS.
4. In Authentication's sign-in/provider settings, keep **email/password enabled**. Disable **Allow new users to sign up**, anonymous sign-in and unused providers. Keep email confirmation enabled; personally provisioned users are individually confirmed by the administrator.
5. Leave **custom SMTP unset**. Do not use Invite, forgot-password email, OTP or resend confirmation as part of this workflow. Auto-confirm means administrator attestation, not proof of mailbox ownership. Supabase's unrelated public Auth endpoints may still attempt email using its own defaults; this app does not call those flows, and SMTP-unset is not a blanket promise that hosted Auth can never send mail.
6. Set Auth's **Site URL** to the final deployed app URL, including its repository path if applicable. Password sign-in needs no callback route or email redirect. Preserve the default short-lived JWT expiry and SDK session refresh; browser persistence is best effort, not permanent.

The migration defines `training_sessions` with UUID `id`, owner `user_id`, date-only `trained_on`, and database-generated `created_at`, plus an owner/date index. Ownership defaults to `auth.uid()`. Authenticated users may **select, insert and delete only their own rows**, with insert grants restricted to **`id` and `trained_on`**. They cannot supply `user_id`/`created_at` or update rows. `created_at` is immutable to clients. Anonymous access is denied.

The **security-invoker** function `training_summary` returns `today`, `month_count` and `total_count` with the caller's permissions. RLS applies inside the function just as it does to direct queries, so each person counts only their own rows. Do not change it to security-definer. Today's date, allowed backdating and month boundaries use database Europe/Berlin dates; future dates are forbidden. Multiple sessions on one date are allowed. Counts are derived from rows, not writable counters. Display names confer no permissions.

For CLI-based local database verification, install the Supabase CLI and Docker, then use `supabase start`, `supabase db reset` and `supabase test db` with the supplied config, migration and `supabase/tests/training.test.sql`. These are separate from `npm test`; do not treat frontend unit-test success as database/RLS verification. The pgTAP file covers the original table and needs a season that contains today (the migration creates 2026/27) because of the month lock; the season, ranking, team and seed logic is covered by the PGlite tests in `tests/`. The pgTAP test has not been re-run against the season migration.

## Season, Leaderboard And League

**Rules implemented.** A season lasts twelve months from `src/config/season.ts`. Teams are fixed per **calendar quarter** (`2026-Q4` is October to December) in `src/config/league.ts`, a team's monthly score is its sessions divided by its number of members, and when a month closes (23:59 Europe/Berlin) the top three teams get a bonus of 3, 2 and 1. **Equal scores share a place and the next place is skipped** (two teams tied for 1st both get +3, the next team is 3rd with +1). A team without any session gets no bonus. A quarter's result is the sum of its three monthly results; the running month counts without bonus until it closes, but the table shows the bonus a team would get if the month ended now. The leaderboard counts every session of the season, shares places the same way and shows an arrow for the change since this morning.

**Configuration (in the bundle, so no secrets).** `src/config/season.ts` holds the first day of the season. `src/config/league.ts` lists each quarter's teams by **account id** (as printed by `npm run users`); never put emails there, the file ships in the public bundle. Changing teams means editing this file and deploying. A test project has other account ids and may use an earlier season start: create `src/config/local.ts` (ignored by git and read only by the development server, so it can never end up in a production build) exporting `seasonStart` and/or `league`; `dev-seed.sql` prints a ready-made file.

**Database** (all additive; see the migrations):

- `202610060001_leaderboard.sql` (the organizer's): `leaderboard()` returns each active account's display name and totals, `monthly_points(from, to)` returns points per account and month.
- `202610070001_month_lock_and_daily_points.sql`: a **month lock** and `daily_points(from, to)`, which returns one row per active account with parallel arrays of training days and session counts. The app derives the leaderboard, rank arrows, team averages, bonuses, champions and charts from it.
- These functions are security definer by design (members must see each other's totals) but return **aggregates only, never session rows**, are executable only by `authenticated`, and exclude deleted and banned accounts (`monthly_points` is the organizer's original and also counts banned accounts; the app does not use it). `training_sessions` rows stay readable only by their owner, and `training_summary` remains security invoker.

**Month lock.** A trigger lets signed-in clients add or delete a session only inside the **current** Berlin month, so closed months cannot change retroactively and the results the app calculates stay stable. Calls without a user token (the dashboard SQL editor, the service role) bypass the lock; this is the intended way for the project owner to fix a forgotten session.

**Account metadata.** The display name, the optional last-year session count and the unlock flag are stored in the account's user metadata (as the display name always was). Users can edit their own metadata; nothing in it grants permissions. Names are not forced to be unique, so avoid duplicates (the charts identify people by name).

**Unlocking the screens.** The Home season chart, the Leaderboard and League tabs and the last-year field stay hidden until an account's first confirmed session after the feature is deployed. That session shows a fullscreen celebration (rainbow, confetti and stars; a static card if the device prefers reduced motion), and the unlock is stored as `features_unlocked_at` in the account metadata, so it is the same on every device. If saving it fails, the screens still appear on that device and the celebration may repeat once. It is a UI gimmick, not access control. To replay it for an account: `update auth.users set raw_user_meta_data = raw_user_meta_data - 'features_unlocked_at' where email = '...';`. The local preview has a "Replay unlock" button in Account, and `dev-seed.sql` unlocks the seeded accounts.

**Release guard (temporary).** While `requireTestMode` in `src/config/release.ts` is `true`, the new screens and the unlock celebration are switched off for everybody, so a deployment changes nothing visible. In a browser, five quick taps on the connection indicator ("Connected") in the top bar switch **test mode** on or off for that browser only (stored locally; a small "test" badge shows while it is on). With test mode on, the next confirmed session shows the celebration and unlocks the new screens for that account; other accounts and other browsers are unaffected. The development server and the local preview ignore the guard. To release for everyone, set `requireTestMode` to `false` and then delete the guard (`src/config/release.ts`, `src/lib/testMode.ts`, `src/composables/useTestMode.ts`, `tests/testMode.test.ts` and the `featuresEnabled` / `registerTestTap` lines in `App.vue`). Switching test mode **off** also resets the account's unlock, so the new features are hidden again and the celebration can be replayed with the next session after switching it on.

**Charts and export.** Home and Leaderboard draw cumulative lines with a zoomed x-axis (up to today plus a margin) and a capped y-axis; League draws per-head lines per team for the selected month, with the final result at the line end once a month has closed. The dashed pace extrapolation (last 14 days, `PACE_WINDOW` in `src/lib/seasonChart.ts`) is switched off (`SHOW_TEAM_PROJECTION` in `src/lib/teams.ts`). The copy buttons put the visible table on the clipboard as a text table for pasting into a chat.

**Rolling back.** `supabase/rollback/202610070001_month_lock_and_daily_points_down.sql` removes the trigger and the two functions it created and leaves `training_sessions` and `auth.users` untouched; the tests verify this.

## Development Seed Data

`supabase/dev/dev-seed.sql` fills a **test** project with realistic data for trying the screens. It expects the accounts `u1@test.test` to `u11@test.test`, stores names, plausible last-year counts and the unlock flag in their metadata, and generates random sessions from `v_start` (default 2026-04-01, so two quarters are finished and have champions) until today (about half the group 0-2 sessions a week, the rest 1-3). It ends with a result `local_ts`: paste that text into `src/config/local.ts` so the dev server uses your test accounts' ids and the earlier season start. Run it in the SQL editor of a test project only, after changing `v_is_test_db` to `true`; the committed value is `false`. `supabase/dev/dev-unseed.sql` removes the seeded sessions (recognised by `created_at` equal to `trained_on` at 12:00:00 UTC); accounts and metadata stay. A test project that ran the earlier profile/season/team migrations can be cleaned with `supabase/dev/test-project-reset.sql` (it never touches sessions or accounts). `npm test` runs these scripts against embedded PostgreSQL.

## Provision Accounts

In Authentication > Users, choose **Add User**, **not Invite User**. Supply the email identifier, a unique password-manager-generated password of at least 24 characters, and enable **auto-confirm** where offered. Do not disable confirmation globally as a workaround. If this dashboard flow is unavailable, use the local utility:

```sh
npm run users -- --help
npm run users -- create friend@example.com "Display Name"
```

The name is optional. The utility prompts for a project URL and a **hidden admin secret** in an interactive local terminal. Use a Supabase `sb_secret_...` key or a legacy `service_role` key from the project's API-key settings. Alternatively provide `SUPABASE_URL` and `SUPABASE_SECRET_KEY` through the **local process environment**, using your trusted secret manager. Do not type secrets into shell commands/history, put them in frontend env files or run this utility in CI. It does not read Vite variables or automatically load dotenv files.

`create` calls `auth.admin.createUser` with `email_confirm: true`. Create and reset generate a cryptographically random **32-character password**, including mixed case, numbers and symbols. The password prints only after a successful operation. Do not record/share terminal output, logs or screenshots; secure or clear terminal scrollback afterward. Store each email-to-UUID mapping securely, outside git, and deliver credentials to the verified friend over a private channel. Friends should keep their password in a password manager. The utility never prints full Auth objects or the admin secret.

## Recovery And Access

Verify the friend's identity personally or through a known communication channel. Find their existing Auth UUID in your private mapping or dashboard, then run:

```sh
npm run users -- reset 00000000-0000-0000-0000-000000000000
npm run users -- ban 00000000-0000-0000-0000-000000000000
npm run users -- unban 00000000-0000-0000-0000-000000000000
```

Replace the example UUID with the real account UUID. Reset uses `auth.admin.updateUserById` to change the password on the **same UUID**, preserving history. Never delete/recreate an account for recovery: account deletion can cascade to training rows. Deliver the new password privately. There is no email reset or optional password-change UI.

Ban uses `ban_duration` (100 years); unban uses `none`. A ban prevents new authentication and refresh, but **already-issued JWTs may remain usable until expiry**. A password reset is not a guarantee of immediate access-token invalidation or immediate RLS denial either. For a compromised account, ban first, reset the same UUID, and use the dashboard's session-revocation controls if available; independently test refresh revocation in staging. Keep the account banned through the remaining access-token lifetime, verify the old credentials/refresh can no longer authenticate, then unban and deliver the replacement credential when appropriate. RLS ownership alone is not a token revocation mechanism.

New phones, cleared storage and separate browser/PWA storage may require signing in again with existing credentials. The SDK manages token persistence/refresh; the app does not retain the password. Back up/export data using trusted project-owner tools, and review your plan's backup, quota and project availability limits rather than assuming paid features are included.

## GitHub Pages

1. Commit the lockfile and enable repository Settings > Pages > **GitHub Actions** as the source.
2. In Settings > Secrets and variables > Actions > **Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. They must contain only the public project origin and publishable key (or legacy `anon` key). Never add admin secrets/service-role keys to this deployment.
3. The workflow defaults the base path to `/REPOSITORY/`. A repository named `USER.github.io` defaults to `/`. For a custom domain, set repository variable `VITE_BASE_PATH` to `/`, or another actual served prefix ending in `/`. Configure the custom domain/DNS through Pages separately.
4. Push to `main` or manually run **Deploy Pages**. The workflow uses Node 22, `npm ci`, `npm test` and `npm run build`, validates public configuration before build, uploads `dist` and deploys the Pages artifact. Permissions are `contents: read`, `pages: write` and `id-token: write`.
5. Use the URL returned by Pages; no final URL is assumed here. Update the Supabase Site URL and send the app link plus `FRIENDS.md` to friends. Verify the shell, icons, manifest, service worker and reload under the final base path.

For a local production build targeting a repository path, set `VITE_BASE_PATH=/REPOSITORY/` before building. Public configuration is baked into the bundle; changing repository variables requires rebuilding. The local admin utility is not imported into the frontend and is never a deployment step.

## Release Verification

These are checks to perform, **not claims that a live backend or installed device has been tested**:

- On a staging project with custom SMTP unset, provision two confirmed accounts, sign in without mail and verify raw public signup and anonymous access are rejected.
- Using each account's real authenticated API session, test default-date inserts, explicit past dates, multiple sessions per date, summary counts and delete. Verify future dates, updates and supplying `user_id`/`created_at` are rejected.
- As account B, attempt to select/delete A's known row UUID and insert for A. Verify A's row remains unchanged using A's session; zero affected rows alone do not prove all intended rules. Verify anonymous calls fail.
- Reset A's existing UUID, sign in with the replacement password and confirm history remains. Test ban/new sign-in/refresh rejection and document remaining JWT access until expiry.
- Test a response-lost save and **Retry unconfirmed save**: the same action UUID must reconcile without another session. Do not create a new action to resolve uncertainty.
- With real sessions of two accounts, verify the month lock (adding or deleting in a closed month is rejected for the client and works in the SQL editor), that `leaderboard()` and `daily_points()` return only aggregates and that anonymous calls fail, and that the league config lists the real account ids.
- Run `npm test` and `npm run build`, plus database tests where the CLI/Docker environment is available. Inspect `dist` for accidental secrets and ensure authenticated API responses are not cached by the service worker.
- Install on real iPhone/Android devices, then sign in inside the installed app. Check name/icon, persistence, offline disabled writes, updates and the final Pages path. Browser automation alone does not prove mobile installation/storage behavior.

## Troubleshooting

- **Setup required / invalid key:** replace placeholder public values and restart/rebuild. Never substitute an admin key to fix frontend access.
- **Unconfirmed account:** confirm that specific personally provisioned account in the dashboard, or provision via the utility's confirmed-create flow; do not send an invite or recreate an existing account with history.
- **RLS/permission error:** check the migration, restricted column grants, authenticated session and ownership. Do not turn off RLS or broaden grants as a workaround.
- **Future date rejected:** the authority is Europe/Berlin today, not the phone timezone. Backdating accepts dates only, not time-of-day, and only within the **current month**.
- **"That month is closed":** closed months are locked for clients. The project owner can add or remove the session in the SQL editor, which bypasses the lock.
- **League shows "No teams are set up yet" or unknown names:** `src/config/league.ts` needs the quarter's teams with the real account ids (a team member whose id is not an active account is shown as "Unknown"). Replace the placeholder ids, then redeploy.
- **Leaderboard or League cannot load:** the leaderboard and daily-points functions must exist in the project; run the migrations in order.
- **Connection/project unavailable:** reconnect or restore the project; saves are not queued offline. For an uncertain insert use the pending retry control, not a new session. A failed/uncertain save is not success.
- **Signed out after storage changes:** use the same credentials; ask the organizer for same-UUID recovery if lost. There is no recovery email.
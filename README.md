# yolo-fitness

A private training log built with Vue 3, TypeScript and Vite. GitHub Pages serves the static PWA; managed Supabase Auth and Postgres provide accounts and data enforcement. There is no custom application backend or email service. The installed app is named **yolo-fitness**, with a rounded pink plus on a near-black icon.

Accounts use an email identifier and a personally delivered password. There is no self-signup, invitation email, OTP, email recovery or password-change UI. The organizer provisions and recovers accounts. Individual training sessions are private between ordinary accounts, not from the Supabase project administrator. Season rankings and team standings expose **aggregates only** (names, counts and per-day totals, never another person's session rows); see [Season, Rankings And Teams](#season-rankings-and-teams).

The app is built for a yearly **season challenge** among friends: log sessions with the big plus, follow your own progress toward 100 sessions and last year's count, compare yourself in the individual ranking, and watch the quarterly team standings. A season is one year starting on `seasons.starts_on` (2026-10-01 for the first one).

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
2. In the project's SQL Editor, execute the complete contents of the files in `supabase/migrations/` **in filename order**: first `202610040001_training.sql`, then `202610070001_season.sql`, then `202610070002_features_unlock.sql`. Apply them to a new project before using the frontend, and apply a new migration **before** deploying the frontend that needs it (the season migration is additive, so the previous frontend keeps working). Keep the migrations in version control; use subsequent migrations for later schema changes rather than blindly rerunning one on an existing database.
3. Obtain the project URL and **publishable** API key from the project's connection/API settings (dashboard labels may vary). Use them in the public environment variables above. A legacy `anon` key is also public; neither public key replaces grants and RLS.
4. In Authentication's sign-in/provider settings, keep **email/password enabled**. Disable **Allow new users to sign up**, anonymous sign-in and unused providers. Keep email confirmation enabled; personally provisioned users are individually confirmed by the administrator.
5. Leave **custom SMTP unset**. Do not use Invite, forgot-password email, OTP or resend confirmation as part of this workflow. Auto-confirm means administrator attestation, not proof of mailbox ownership. Supabase's unrelated public Auth endpoints may still attempt email using its own defaults; this app does not call those flows, and SMTP-unset is not a blanket promise that hosted Auth can never send mail.
6. Set Auth's **Site URL** to the final deployed app URL, including its repository path if applicable. Password sign-in needs no callback route or email redirect. Preserve the default short-lived JWT expiry and SDK session refresh; browser persistence is best effort, not permanent.

The migration defines `training_sessions` with UUID `id`, owner `user_id`, date-only `trained_on`, and database-generated `created_at`, plus an owner/date index. Ownership defaults to `auth.uid()`. Authenticated users may **select, insert and delete only their own rows**, with insert grants restricted to **`id` and `trained_on`**. They cannot supply `user_id`/`created_at` or update rows. `created_at` is immutable to clients. Anonymous access is denied.

The **security-invoker** function `training_summary` returns `today`, `month_count` and `total_count` with the caller's permissions. RLS applies inside the function just as it does to direct queries, so each person counts only their own rows. Do not change it to security-definer. Today's date, allowed backdating and month boundaries use database Europe/Berlin dates; future dates are forbidden. Multiple sessions on one date are allowed. Counts are derived from rows, not writable counters. Display names confer no permissions; only the `profiles.is_admin` flag does, and it can be set only in SQL.

For CLI-based local database verification, install the Supabase CLI and Docker, then use `supabase start`, `supabase db reset` and `supabase test db` with the supplied config, migration and `supabase/tests/training.test.sql`. These are separate from `npm test`; do not treat frontend unit-test success as database/RLS verification. The pgTAP file covers the original table and needs a season that contains today (the migration creates 2026/27) because of the month lock; the season, ranking, team and seed logic is covered by the PGlite tests in `tests/`. The pgTAP test has not been re-run against the season migration.

## Season, Rankings And Teams

**Rules implemented.** A season is 12 consecutive monthly periods counted from `seasons.starts_on`; every three form a quarter. Teams (pairs and one trio for eleven people) are drawn per quarter. A team's monthly score is its sessions divided by its number of members, so pairs and trios compare fairly. When a month closes, the top three places get a bonus of 3, 2 and 1; **equal scores share a place** (two teams tied for 1st both get 3 and the next team is 2nd with 2). A quarter's result is the sum of its three monthly results; the running month counts without bonus until it closes. The individual ranking is the season total. The 100-session goal and each person's last-year count are shown against the personal curve on Home. A month closes at the Europe/Berlin date rollover, so the last day counts completely.

**Data model** (`202610070001_season.sql`):

- `seasons` (readable by everyone, written only by the project owner), `profiles` (display name, optional `last_year_count`, `is_admin`), `teams` and `team_members` (readable by everyone, written only through `set_team_assignments`).
- Display names live in `profiles`, are unique ignoring case, and are created for new accounts by a trigger on `auth.users` (the migration backfills existing accounts from their user metadata). Users may edit only their own `display_name` and `last_year_count`; they cannot grant themselves `is_admin`.

**Privacy.** Raw `training_sessions` rows stay readable only by their owner. The ranking functions `season_ranking`, `season_daily_counts`, `team_month_standings`, `team_quarter_standings` and `team_daily_counts` are deliberately **security definer** so that members can see each other's totals. They return names, counts, per-day totals and last-year counts only, run with a fixed empty `search_path`, are executable only by `authenticated`, and delegate to functions in a `private` schema that the API does not expose. `training_summary` remains security invoker. Do not widen these functions to return session rows.

**Month lock.** A trigger lets signed-in clients add or delete a session only inside the **current** monthly period, so closed months cannot change retroactively. Calls without a user token (the dashboard SQL editor, the service role) bypass the lock; this is the intended way for the project owner to fix a forgotten session. Before the first season starts and after the last one ends, clients cannot log at all.

**Administrator.** Set the flag for the organizer's account in the SQL editor (replace the email):

```sql
update public.profiles set is_admin = true
where user_id = (select id from auth.users where email = 'organizer@example.com');
```

An administrator sees **Account > Manage teams**: pick a quarter, set the number of teams, assign people by hand or draw randomly (pairs, with a trio for an odd count) and save. The page calls `set_team_assignments`, which checks `is_admin` in the database; hiding the button is only convenience. Changing a quarter that has already started recalculates its standings retroactively, so the page asks for confirmation. Empty teams are dropped when saving.

**New season.** Insert another row into `seasons` with its own `starts_on`. The app uses the season that contains today; seasons must not overlap, and teams are per season. There is no screen for this yet.

**Charts.** Home and Ranking show cumulative lines with a zoomed x-axis (up to today plus a margin) and a capped y-axis. The Teams tab shows per-head lines per team for the selected month. The dashed pace extrapolation (last 14 days, `PACE_WINDOW` in `src/lib/seasonChart.ts`) is currently switched off for the Teams chart by `SHOW_TEAM_PROJECTION` in `src/lib/teams.ts`; Home and Ranking draw none.

**Unlocking the screens.** The Home season chart, the Ranking and Teams tabs and the last-year field stay hidden until an account's first confirmed session after the feature is deployed. That session shows a fullscreen celebration (rainbow, confetti and stars; reduced to a static card if the device prefers reduced motion), and the unlock is stored per account in `profiles.features_unlocked_at` (`202610070002_features_unlock.sql`), so it is the same on every device. If saving the unlock fails, the screens still appear on that device and the celebration may repeat once. It is a UI gimmick, not access control. To replay it for an account: `update public.profiles set features_unlocked_at = null where user_id = (select id from auth.users where email = '...');`. The local preview has a "Replay unlock" button in Account, and `dev-seed.sql` unlocks the seeded accounts.

**Rolling back.** `supabase/rollback/202610070002_features_unlock_down.sql` removes only the unlock column; run it before `supabase/rollback/202610070001_season_down.sql`, which removes everything the season migration created (in one transaction) and leaves `training_sessions` and `auth.users` untouched; the tests verify this. What is stored only in the new tables (profile names, last-year counts, admin flags, teams) is lost, so export it first if it matters, then deploy a frontend from before the season feature.

## Development Seed Data

`supabase/dev/dev-seed.sql` fills a **test** project with realistic data for trying the screens: it expects the accounts `u1@test.test` to `u11@test.test`, names them, sets plausible last-year counts, generates random sessions from `v_start` (default 2026-08-01, so some months are closed) until today (about half the group 0-2 sessions a week, the rest 1-3) and sets the Q1 teams. It moves the season start to `v_start`. Run it in the SQL editor of a test project only, after changing `v_is_test_db` to `true`; the committed value is `false` so it cannot run by accident. `supabase/dev/dev-unseed.sql` removes the seeded sessions and all teams of the season and restores the start date 2026-10-01; accounts, names and last-year counts stay. Seeded sessions are recognised by `created_at` equal to `trained_on` at 12:00:00 UTC. `npm test` runs both scripts against embedded PostgreSQL.

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
- With real sessions of two accounts, verify the month lock (adding or deleting in a closed month is rejected for the client and works in the SQL editor), that the ranking/team functions return only aggregates and that anonymous calls fail, that a non-admin's `set_team_assignments` is rejected and an administrator can replace a quarter, and that nobody can edit another profile or set `is_admin`.
- Run `npm test` and `npm run build`, plus database tests where the CLI/Docker environment is available. Inspect `dist` for accidental secrets and ensure authenticated API responses are not cached by the service worker.
- Install on real iPhone/Android devices, then sign in inside the installed app. Check name/icon, persistence, offline disabled writes, updates and the final Pages path. Browser automation alone does not prove mobile installation/storage behavior.

## Troubleshooting

- **Setup required / invalid key:** replace placeholder public values and restart/rebuild. Never substitute an admin key to fix frontend access.
- **Unconfirmed account:** confirm that specific personally provisioned account in the dashboard, or provision via the utility's confirmed-create flow; do not send an invite or recreate an existing account with history.
- **RLS/permission error:** check the migration, restricted column grants, authenticated session and ownership. Do not turn off RLS or broaden grants as a workaround.
- **Future date rejected:** the authority is Europe/Berlin today, not the phone timezone. Backdating accepts dates only, not time-of-day, and only within the **current month**.
- **"That month is closed":** closed months are locked for clients. The project owner can add or remove the session in the SQL editor, which bypasses the lock.
- **"That name is already taken":** display names are unique ignoring case; choose another.
- **Ranking or Teams stay empty:** there must be a season containing today in `seasons`, and the quarter's teams must be set (Account > Manage teams as administrator). Without an active season, clients cannot log sessions either.
- **No "Manage teams" button:** the account's `profiles.is_admin` is not set; see Season, Rankings And Teams.
- **Connection/project unavailable:** reconnect or restore the project; saves are not queued offline. For an uncertain insert use the pending retry control, not a new session. A failed/uncertain save is not success.
- **Signed out after storage changes:** use the same credentials; ask the organizer for same-UUID recovery if lost. There is no recovery email.
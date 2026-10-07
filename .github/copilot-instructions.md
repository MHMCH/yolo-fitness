# Project Conventions

- Vue 3, TypeScript, Vite; static GitHub Pages hosting.
- Supabase password accounts are personally provisioned; no SMTP or public signup.
- Keep privileged keys and admin utilities out of the frontend bundle.
- Database grants and RLS enforce ownership; display names never confer permissions.
- Calendar dates and monthly totals use Europe/Berlin.
- No offline writes or custom action artwork. Session sound plays only after confirmed saves and can be disabled.
- Leaderboard/league view is allowed: it reads only aggregate points and display names via security-definer RPCs; individual sessions stay owner-only. Teams are listed by account UUID in src/config/league.ts.
- Validate changes with npm test and npm run build.
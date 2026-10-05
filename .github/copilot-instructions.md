# Project Conventions

- Vue 3, TypeScript, Vite; static GitHub Pages hosting.
- Supabase password accounts are personally provisioned; no SMTP or public signup.
- Keep privileged keys and admin utilities out of the frontend bundle.
- Database grants and RLS enforce ownership; display names never confer permissions.
- Calendar dates and monthly totals use Europe/Berlin.
- No offline writes, team dashboard, sound effects or custom action artwork in the MVP.
- Validate changes with npm test and npm run build.
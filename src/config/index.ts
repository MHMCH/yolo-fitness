import { league as baseLeague, type LeagueConfig } from './league'
import { seasonStart as baseSeasonStart } from './season'

export type AppConfig = { seasonStart: string; league: LeagueConfig }
type LocalConfig = { seasonStart?: string; league?: LeagueConfig }

// A test project has its own account ids and may use an earlier season start. `src/config/local.ts` is
// ignored by git, so it does not exist in the deployment build. It is read by the development server and, to
// rehearse a production build against a test project, by the rehearsal build (`npm run rehearsal`).
const locals = import.meta.glob<LocalConfig>('./local.ts', { eager: true })
const useLocal = import.meta.env.DEV || import.meta.env.MODE === 'rehearsal'
const local = useLocal ? Object.values(locals)[0] : undefined

export const appConfig: AppConfig = {
  seasonStart: local?.seasonStart ?? baseSeasonStart,
  league: local?.league ?? baseLeague,
}

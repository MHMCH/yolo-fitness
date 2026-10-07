import { league as baseLeague, type LeagueConfig } from './league'
import { seasonStart as baseSeasonStart } from './season'

export type AppConfig = { seasonStart: string; league: LeagueConfig }
type LocalConfig = { seasonStart?: string; league?: LeagueConfig }

// A test project has its own account ids and may use an earlier season start. `src/config/local.ts` is
// ignored by git and only read by the development server, so it can never reach a production build.
const locals = import.meta.glob<LocalConfig>('./local.ts', { eager: true })
const local = import.meta.env.DEV ? Object.values(locals)[0] : undefined

export const appConfig: AppConfig = {
  seasonStart: local?.seasonStart ?? baseSeasonStart,
  league: local?.league ?? baseLeague,
}

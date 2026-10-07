import type { Season } from '../types/database'
import { berlinDate } from './trainingDates'
import { currentSeason, seasonEnd } from './seasonChart'
import { supabase } from './supabase'

export interface SeasonRepository {
  season(): Promise<Season | null>
  /** The signed-in user's own session dates inside the season, ascending. */
  ownDays(season: Season): Promise<string[]>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const seasonRepository: SeasonRepository = {
  async season() {
    const { data, error } = await client().from('seasons').select('*')
    if (error) throw error
    return currentSeason(data, berlinDate())
  },
  async ownDays(season) {
    const { data, error } = await client().from('training_sessions').select('trained_on')
      .gte('trained_on', season.starts_on).lt('trained_on', seasonEnd(season.starts_on))
      .order('trained_on', { ascending: true }).limit(1000)
    if (error) throw error
    return data.map((row) => row.trained_on)
  },
}

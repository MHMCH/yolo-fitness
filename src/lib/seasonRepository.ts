import { seasonEnd } from './seasonChart'
import { supabase } from './supabase'

export interface SeasonRepository {
  /** The signed-in user's own session dates in the twelve months from `start`, ascending. */
  ownDays(start: string): Promise<string[]>
}

export const seasonRepository: SeasonRepository = {
  async ownDays(start) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error } = await supabase.from('training_sessions').select('trained_on')
      .gte('trained_on', start).lt('trained_on', seasonEnd(start))
      .order('trained_on', { ascending: true }).limit(1000)
    if (error) throw error
    return data.map((row) => row.trained_on)
  },
}

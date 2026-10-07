import type { DailySeries, RankingRow } from '../types/database'
import { supabase } from './supabase'

export interface RankingRepository {
  ranking(): Promise<RankingRow[]>
  daily(): Promise<DailySeries[]>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const rankingRepository: RankingRepository = {
  async ranking() {
    const { data, error } = await client().rpc('season_ranking')
    if (error) throw error
    return data
  },
  async daily() {
    const { data, error } = await client().rpc('season_daily_counts')
    if (error) throw error
    return data
  },
}

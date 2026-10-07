import type { DailyPoints, LeaderboardEntry } from '../types/database'
import { supabase } from './supabase'

export interface BoardRepository {
  /** Active accounts and their display names. */
  leaderboard(): Promise<LeaderboardEntry[]>
  /** Sessions per account and day in [from, to). */
  dailyPoints(from: string, to: string): Promise<DailyPoints[]>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const boardRepository: BoardRepository = {
  async leaderboard() {
    const { data, error } = await client().rpc('leaderboard')
    if (error) throw error
    return data ?? []
  },
  async dailyPoints(from, to) {
    const { data, error } = await client().rpc('daily_points', { from_date: from, to_date: to })
    if (error) throw error
    return data ?? []
  },
}

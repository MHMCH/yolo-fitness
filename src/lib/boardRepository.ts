import type { LeaderboardEntry, MonthlyPoints } from '../types/database'
import { supabase } from './supabase'

export interface BoardRepository {
  leaderboard(): Promise<LeaderboardEntry[]>
  monthlyPoints(from: string, to: string): Promise<MonthlyPoints[]>
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
  async monthlyPoints(from, to) {
    const { data, error } = await client().rpc('monthly_points', { from_date: from, to_date: to })
    if (error) throw error
    return data ?? []
  },
}

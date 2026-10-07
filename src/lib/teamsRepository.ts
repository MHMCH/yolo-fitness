import type { TeamDaily, TeamMonthRow, TeamQuarterRow } from '../types/database'
import { supabase } from './supabase'

export interface TeamsRepository {
  month(quarter: number, month: number): Promise<TeamMonthRow[]>
  daily(quarter: number, month: number): Promise<TeamDaily[]>
  quarter(quarter: number): Promise<TeamQuarterRow[]>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const teamsRepository: TeamsRepository = {
  async month(quarter, month) {
    const { data, error } = await client().rpc('team_month_standings', { p_quarter: quarter, p_month: month })
    if (error) throw error
    return data
  },
  async daily(quarter, month) {
    const { data, error } = await client().rpc('team_daily_counts', { p_quarter: quarter, p_month: month })
    if (error) throw error
    return data
  },
  async quarter(quarter) {
    const { data, error } = await client().rpc('team_quarter_standings', { p_quarter: quarter })
    if (error) throw error
    return data
  },
}

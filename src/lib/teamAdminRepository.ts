import type { Season } from '../types/database'
import type { Assignment } from './teamDraw'
import { supabase } from './supabase'

export type AdminPerson = { id: string; name: string }

export interface TeamAdminRepository {
  people(): Promise<AdminPerson[]>
  /** Current teams of a quarter as user id -> slot. */
  assignments(season: Season, quarter: number): Promise<Assignment>
  /** Replace the quarter's teams; the position in `teams` is the slot. */
  save(quarter: number, teams: string[][]): Promise<void>
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export const teamAdminRepository: TeamAdminRepository = {
  async people() {
    const { data, error } = await client().from('profiles').select('user_id, display_name').order('display_name')
    if (error) throw error
    return data.map((row) => ({ id: row.user_id, name: row.display_name ?? 'Unnamed' }))
  },
  async assignments(season, quarter) {
    const teams = await client().from('teams').select('id, slot').eq('season_id', season.id).eq('quarter', quarter)
    if (teams.error) throw teams.error
    const members = await client().from('team_members').select('user_id, team_id').eq('season_id', season.id).eq('quarter', quarter)
    if (members.error) throw members.error
    const slotOf = new Map(teams.data.map((team) => [team.id, team.slot]))
    return Object.fromEntries(members.data.map((member) => [member.user_id, slotOf.get(member.team_id) ?? null]))
  },
  async save(quarter, teams) {
    const { error } = await client().rpc('set_team_assignments', { p_quarter: quarter, p_teams: teams })
    if (error) throw error
  },
}

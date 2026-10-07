export type TrainingSession = {
  id: string
  user_id: string
  trained_on: string
  created_at: string
}

export type Summary = { today: string; month_count: number; total_count: number }
export type Season = { id: number; name: string; starts_on: string }
export type Profile = { user_id: string; display_name: string | null; last_year_count: number | null; is_admin: boolean }

export type RankingRow = { user_id: string; display_name: string; sessions: number; rank: number; last_year_count: number | null }
export type DailySeries = { user_id: string; days: string[]; counts: number[] }

export type TeamMonthRow = {
  team_id: string; slot: number; members: string[]; member_count: number; sessions: number
  average: number; rank: number; bonus: number | null; started: boolean; closed: boolean
}
export type TeamQuarterRow = {
  team_id: string; slot: number; members: string[]; member_count: number
  scores: Array<number | null>; bonuses: Array<number | null>; total: number; rank: number
}
export type TeamDaily = { team_id: string; slot: number; days: string[]; counts: number[] }

export type Database = {
  public: {
    Tables: {
      training_sessions: {
        Row: TrainingSession
        Insert: { id: string; trained_on?: string }
        Update: never
        Relationships: []
      }
      seasons: {
        Row: Season
        Insert: never
        Update: never
        Relationships: []
      }
      teams: {
        Row: { id: string; season_id: number; quarter: number; slot: number }
        Insert: never
        Update: never
        Relationships: []
      }
      team_members: {
        Row: { season_id: number; quarter: number; user_id: string; team_id: string }
        Insert: never
        Update: never
        Relationships: []
      }
      profiles: {
        Row: Profile
        Insert: never
        Update: { display_name?: string | null; last_year_count?: number | null }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      training_summary: { Args: Record<string, never>; Returns: Summary[] }
      season_ranking: { Args: Record<string, never>; Returns: RankingRow[] }
      season_daily_counts: { Args: Record<string, never>; Returns: DailySeries[] }
      team_month_standings: { Args: { p_quarter: number; p_month: number }; Returns: TeamMonthRow[] }
      team_quarter_standings: { Args: { p_quarter: number }; Returns: TeamQuarterRow[] }
      team_daily_counts: { Args: { p_quarter: number; p_month: number }; Returns: TeamDaily[] }
      set_team_assignments: { Args: { p_quarter: number; p_teams: string[][] }; Returns: undefined }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

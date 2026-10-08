export type TrainingSession = {
  id: string
  user_id: string
  trained_on: string
  created_at: string
}

export type Summary = { today: string; month_count: number; total_count: number }

export type LeaderboardEntry = { user_id: string; display_name: string; total_points: number; points_before_today: number }

export type MonthlyPoints = { user_id: string; month: string; points: number }

/** One account's sessions per training day, as parallel arrays (never individual session rows). */
export type DailyPoints = { user_id: string; days: string[]; points: number[] }

export type Database = {
  public: {
    Tables: {
      training_sessions: {
        Row: TrainingSession
        Insert: { id: string; trained_on?: string }
        Update: never
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      training_summary: { Args: Record<string, never>; Returns: Summary[] }
      leaderboard: { Args: Record<string, never>; Returns: LeaderboardEntry[] }
      monthly_points: { Args: { from_date: string; to_date: string }; Returns: MonthlyPoints[] }
      daily_points: { Args: { from_date: string; to_date: string }; Returns: DailyPoints[] }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

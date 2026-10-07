export type TrainingSession = {
  id: string
  user_id: string
  trained_on: string
  created_at: string
}

export type Summary = { today: string; month_count: number; total_count: number }

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
    Functions: { training_summary: { Args: Record<string, never>; Returns: Summary[] } }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
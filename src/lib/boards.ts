import type { DailyPoints, LeaderboardEntry, MonthlyPoints } from '../types/database'

/**
 * Season totals per account. `names` comes from the leaderboard function (active accounts and display names);
 * the points are recounted from the daily series so they cover only the season. A session dated today is the
 * only thing that separates `total_points` from `points_before_today`, which drives the rank arrows.
 */
export function seasonEntries(names: LeaderboardEntry[], daily: DailyPoints[], today: string): LeaderboardEntry[] {
  const byUser = new Map(daily.map((entry) => [entry.user_id, entry]))
  return names.map((entry) => {
    const series = byUser.get(entry.user_id)
    let total = 0
    let before = 0
    series?.days.forEach((day, index) => {
      const count = series.points[index] ?? 0
      if (day <= today) total += count
      if (day < today) before += count
    })
    return { ...entry, total_points: total, points_before_today: before }
  })
}

/** Points per account and month (dated the first of the month), the shape the league maths expects. */
export function monthlyFromDaily(daily: DailyPoints[]): MonthlyPoints[] {
  const sums = new Map<string, MonthlyPoints>()
  for (const series of daily) {
    series.days.forEach((day, index) => {
      const month = `${day.slice(0, 7)}-01`
      const key = `${series.user_id}|${month}`
      const row = sums.get(key) ?? { user_id: series.user_id, month, points: 0 }
      row.points += series.points[index] ?? 0
      sums.set(key, row)
    })
  }
  return [...sums.values()]
}

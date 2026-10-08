import type { LeagueConfig } from '../config/league'
import type { LeaderboardEntry, MonthlyPoints } from '../types/database'
import { isMonthClosed, quarterBounds } from './trainingDates'

const BONUS = [0, 3, 2, 1]
// Team averages are fractions; rounding keeps equal totals equal despite float error.
const round = (value: number) => Math.round(value * 1e6) / 1e6

export type LeaderboardRow = LeaderboardEntry & { rank: number; movement: number }
export type LeagueRow = { team: string[]; monthAverage: number; monthRank: number; monthBonus: number; quarterTotal: number; medals: number[] }
export type QuarterWinner = { key: string; teams: string[][] }

/**
 * Places for the given scores, highest first. Equal scores share a place and the next place follows directly,
 * so no place (and no medal or bonus) is skipped: 3, 3, 2, 1 gives 1, 1, 2, 3.
 */
export function rankWithTies(values: number[]): number[] {
  const distinct = [...new Set(values)].sort((first, second) => second - first)
  return values.map((value) => distinct.indexOf(value) + 1)
}

export function quarterStart(key: string): string {
  const [year, quarter] = key.split('-Q').map(Number)
  return `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`
}

export function quarterLabel(key: string): string {
  const [year, quarter] = key.split('-')
  return `${quarter} ${year}`
}

export function leaderboardRows(entries: LeaderboardEntry[]): LeaderboardRow[] {
  const ranks = rankWithTies(entries.map((entry) => entry.total_points))
  const previous = rankWithTies(entries.map((entry) => entry.points_before_today))
  return entries.map((entry, index) => ({ ...entry, rank: ranks[index], movement: previous[index] - ranks[index] }))
    .sort((first, second) => first.rank - second.rank || first.display_name.localeCompare(second.display_name))
}

export function monthStandings(teams: string[][], points: ReadonlyMap<string, number>) {
  const averages = teams.map((team) => round(team.reduce((sum, id) => sum + (points.get(id) ?? 0), 0) / Math.max(team.length, 1)))
  const ranks = rankWithTies(averages)
  return averages.map((average, index) => ({ average, rank: ranks[index], bonus: average > 0 ? BONUS[ranks[index]] ?? 0 : 0 }))
}

export function quarterTable(teams: string[][], rows: MonthlyPoints[], key: string, today: string): LeagueRow[] {
  const byMonth = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = byMonth.get(row.month) ?? new Map<string, number>()
    month.set(row.user_id, (month.get(row.user_id) ?? 0) + row.points)
    byMonth.set(row.month, month)
  }
  const table: LeagueRow[] = teams.map((team) => ({ team, monthAverage: 0, monthRank: 0, monthBonus: 0, quarterTotal: 0, medals: [] }))
  const current = `${today.slice(0, 7)}-01`
  for (const month of quarterBounds(quarterStart(key)).months) {
    if (month > current) break
    const closed = isMonthClosed(month, today)
    monthStandings(teams, byMonth.get(month) ?? new Map()).forEach(({ average, rank, bonus }, index) => {
      const row = table[index]
      row.quarterTotal = round(row.quarterTotal + average + (closed ? bonus : 0))
      if (closed && bonus) row.medals.push(rank)
      if (month === current) Object.assign(row, { monthAverage: average, monthRank: rank, monthBonus: bonus })
    })
  }
  return table.sort((first, second) => second.monthAverage - first.monthAverage || second.quarterTotal - first.quarterTotal)
}

export function quarterWinners(config: LeagueConfig, points: Record<string, MonthlyPoints[]>, today: string): QuarterWinner[] {
  return Object.keys(config)
    .filter((key) => config[key].length && today >= quarterBounds(quarterStart(key)).end)
    .sort().reverse()
    .map((key) => {
      const table = quarterTable(config[key], points[key] ?? [], key, today)
      const best = Math.max(...table.map((row) => row.quarterTotal))
      return { key, teams: table.filter((row) => row.quarterTotal === best).map((row) => row.team) }
    })
}

import type { LeagueConfig } from '../config/league'
import type { LeaderboardEntry, MonthlyPoints } from '../types/database'
import { isMonthClosed, quarterBounds } from './trainingDates'

const BONUS = [0, 3, 2, 1]
// Team averages are fractions; rounding keeps equal totals equal despite float error.
const round = (value: number) => Math.round(value * 1e6) / 1e6

export type LeaderboardRow = LeaderboardEntry & { rank: number; movement: number }
export type LeagueRow = { team: string[]; monthAverage: number; monthRank: number; monthBonus: number; quarterTotal: number; medals: number[] }
export type QuarterWinner = { key: string; teams: string[][] }

function textTable(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.map((cell) => cell.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')).join(' | ')} |`
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n')
}

export function leaderboardText(rows: LeaderboardRow[]): string {
  return textTable(['Rank', 'Name', 'Points', 'Position change'], rows.map((row) => [
    String(row.rank), row.display_name, String(row.total_points),
    row.movement > 0 ? `${row.movement} up` : row.movement < 0 ? `${Math.abs(row.movement)} down` : 'Unchanged',
  ]))
}

export function leagueText(rows: LeagueRow[], teamName: (team: string[]) => string): string {
  const medals = ['', 'Gold', 'Silver', 'Bronze']
  return textTable(['Team', 'Month', 'Quarter', 'Wins'], rows.map((row) => [
    teamName(row.team), `${row.monthAverage.toFixed(1)}${row.monthBonus ? ` +${row.monthBonus}` : ''}`,
    row.quarterTotal.toFixed(1), row.medals.map((rank) => medals[rank]).join(', '),
  ]))
}

export function rankWithTies(values: number[]): number[] {
  return values.map((value) => 1 + values.filter((other) => other > value).length)
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

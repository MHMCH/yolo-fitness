import type { LeagueConfig } from '../config/league'
import type { DailyPoints, MonthlyPoints } from '../types/database'
import { monthStandings, quarterStart, rankWithTies } from './league'
import { cumulativeFromCounts, diffDays, type ChartSeries, type Tick } from './seasonChart'
import { isMonthClosed, monthBounds, quarterBounds } from './trainingDates'

// Temporary: set to true to draw the dashed pace extrapolation on running months.
export const SHOW_TEAM_PROJECTION = false

/** Distinct on the dark background; a team keeps its colour for its position in the configuration. */
export const TEAM_COLORS = ['#ffb454', '#5ac8fa', '#8fdab3', '#c8a2ff', '#ff7a59', '#e8e35a', '#3fd0c9', '#7a8cff']
export const teamColor = (slot: number) => TEAM_COLORS[(slot - 1) % TEAM_COLORS.length]

export type MonthRange = { lo: string; hi: string; length: number }

/** The calendar month `index` (0-2) of a quarter key such as `2026-Q4`. */
export function monthRange(key: string, index: number): MonthRange {
  const lo = quarterBounds(quarterStart(key)).months[index]
  const hi = monthBounds(lo).end
  return { lo, hi, length: diffDays(lo, hi) }
}

const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
export const monthLabel = (key: string, index: number) => monthName.format(new Date(`${monthRange(key, index).lo}T12:00:00Z`))

/** Quarters that have teams, oldest first. */
export const quarterKeys = (league: LeagueConfig) => Object.keys(league).filter((key) => league[key].length).sort()

/** Quarter and month to show first: the running one, else the latest started quarter, else the first. */
export function defaultSelection(keys: string[], today: string): { key: string; month: number } {
  const current = quarterBounds(today)
  if (keys.includes(current.key)) return { key: current.key, month: current.months.filter((month) => month <= today).length - 1 }
  const started = keys.filter((key) => quarterStart(key) <= today)
  if (started.length) return { key: started[started.length - 1], month: 2 }
  return { key: keys[0] ?? current.key, month: 0 }
}

export type MonthRow = { team: string[]; slot: number; average: number; rank: number; bonus: number; started: boolean; closed: boolean }

/** Standings of one month. While the month runs the bonus is what the team would get if it ended now. */
export function monthRows(teams: string[][], monthly: MonthlyPoints[], range: MonthRange, today: string): MonthRow[] {
  const points = new Map(monthly.filter((row) => row.month === range.lo).map((row) => [row.user_id, row.points]))
  const started = range.lo <= today
  const closed = isMonthClosed(range.lo, today)
  return monthStandings(teams, points)
    .map((standing, index): MonthRow => ({ team: teams[index], slot: index + 1, ...standing, started, closed }))
    .sort((first, second) => first.rank - second.rank || first.slot - second.slot)
}

export type TotalRow = { team: string[]; slot: number; months: Array<number | null>; liveMonth: number | null; total: number; rank: number }

const round = (value: number) => Math.round(value * 1e6) / 1e6

/** Quarter totals: closed months count with bonus, the running month without it, later months not at all. */
export function totalRows(teams: string[][], monthly: MonthlyPoints[], key: string, today: string): TotalRow[] {
  const perMonth = [0, 1, 2].map((index) => monthRows(teams, monthly, monthRange(key, index), today))
  const live = perMonth.findIndex((rows) => rows[0]?.started && !rows[0].closed)
  const rows = teams.map((team, index) => {
    const results = perMonth.map((rows) => {
      const row = rows.find((entry) => entry.slot === index + 1)!
      return row.started ? round(row.average + (row.closed ? row.bonus : 0)) : null
    })
    return { team, slot: index + 1, months: results, liveMonth: live < 0 ? null : live, total: round(results.reduce<number>((sum, value) => sum + (value ?? 0), 0)) }
  })
  const ranks = rankWithTies(rows.map((row) => row.total))
  return rows.map((row, index) => ({ ...row, rank: ranks[index] }))
    .sort((first, second) => first.rank - second.rank || first.slot - second.slot)
}

/** Weekly labels under a month chart: "1 Oct", "8 Oct", "15 Oct", "22 Oct", "29 Oct". */
export function dayTicks(lo: string, length: number): Tick[] {
  const month = monthName.format(new Date(`${lo}T12:00:00Z`))
  return [0, 7, 14, 21, 28].filter((index) => index < length).map((index) => ({ index, label: `${index + 1} ${month}` }))
}

export const formatScore = (value: number) => (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')

export function ordinal(place: number): string {
  const rest = place % 100
  if (rest >= 11 && rest <= 13) return `${place}th`
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th'}`
}

/**
 * One cumulative per-head line per team for a month. A running month ends today; a closed month shows the
 * final result (average plus bonus) at the end of its line.
 */
export function buildTeamSeries(rows: MonthRow[], daily: DailyPoints[], range: MonthRange, today: string, myId: string,
  label: (team: string[]) => string): ChartSeries[] {
  const byUser = new Map(daily.map((entry) => [entry.user_id, entry]))
  return rows.filter((row) => row.started).map((row): ChartSeries => {
    const lastIndex = row.closed ? range.length - 1 : Math.min(range.length - 1, Math.max(0, diffDays(range.lo, today)))
    const days: string[] = []
    const counts: number[] = []
    for (const id of row.team) {
      const entry = byUser.get(id)
      entry?.days.forEach((day, index) => { days.push(day); counts.push(entry.points[index] ?? 0) })
    }
    const values = cumulativeFromCounts(days, counts, range.lo, lastIndex).map((total) => total / Math.max(row.team.length, 1))
    const mine = row.team.includes(myId)
    return {
      id: String(row.slot), label: label(row.team), color: teamColor(row.slot), values,
      width: mine ? 3.5 : 2, emphasis: mine,
      ...(row.closed ? { endText: formatScore(row.average + row.bonus) } : { projection: SHOW_TEAM_PROJECTION, endLabel: true }),
    }
  })
}

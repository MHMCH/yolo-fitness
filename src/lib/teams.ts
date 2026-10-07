import { addMonths, cumulativeFromCounts, diffDays, type ChartSeries, type Tick } from './seasonChart'
import type { TeamDaily, TeamMonthRow } from '../types/database'

/** Distinct on the dark background; a team keeps its colour for its slot. */
export const TEAM_COLORS = ['#ffb454', '#5ac8fa', '#8fdab3', '#c8a2ff', '#ff7a59', '#e8e35a', '#3fd0c9', '#7a8cff']
export const teamColor = (slot: number) => TEAM_COLORS[(slot - 1) % TEAM_COLORS.length]

// Temporary: set to true to draw the dashed pace extrapolation on running months.
export const SHOW_TEAM_PROJECTION = false

export type MonthRange = { lo: string; hi: string; length: number }
export type MonthChoice = 1 | 2 | 3

/** The monthly period `month` (1-3) of `quarter` (1-4): first day, first day after it, and its length in days. */
export function monthRange(seasonStart: string, quarter: number, month: number): MonthRange {
  const index = (quarter - 1) * 3 + month - 1
  const lo = addMonths(seasonStart, index)
  const hi = addMonths(seasonStart, index + 1)
  return { lo, hi, length: diffDays(lo, hi) }
}

/** Quarter and month containing `today`, or null outside the season. */
export function currentSelection(seasonStart: string, today: string): { quarter: number; month: MonthChoice } | null {
  if (today < seasonStart || today >= addMonths(seasonStart, 12)) return null
  for (let index = 11; index >= 0; index--) {
    if (addMonths(seasonStart, index) <= today) return { quarter: Math.floor(index / 3) + 1, month: ((index % 3) + 1) as MonthChoice }
  }
  return null
}

const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })
export const monthLabel = (seasonStart: string, quarter: number, month: number) =>
  monthName.format(new Date(`${monthRange(seasonStart, quarter, month).lo}T12:00:00Z`))

export function quarterLabel(seasonStart: string, quarter: number) {
  return `${monthLabel(seasonStart, quarter, 1)}–${monthLabel(seasonStart, quarter, 3)}`
}

/** Weekly labels under a month chart: "1 Oct", 8, 15, 22, 29. */
export function dayTicks(lo: string, length: number): Tick[] {
  const first = `1 ${monthName.format(new Date(`${lo}T12:00:00Z`))}`
  return [0, 7, 14, 21, 28].filter((index) => index < length).map((index) => ({ index, label: index === 0 ? first : String(index + 1) }))
}

export const formatScore = (value: number) => (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '')

export function ordinal(place: number): string {
  const rest = place % 100
  if (rest >= 11 && rest <= 13) return `${place}th`
  return `${place}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th'}`
}

/**
 * One cumulative per-head line per team for a month. A running month ends today and is extrapolated;
 * a closed month shows its final result (score plus bonus) at the end of the line.
 */
export function buildTeamSeries(rows: TeamMonthRow[], daily: TeamDaily[], range: MonthRange, today: string, myName: string): ChartSeries[] {
  const byTeam = new Map(daily.map((entry) => [entry.team_id, entry]))
  return rows.filter((row) => row.started).map((row): ChartSeries => {
    const lastIndex = row.closed ? range.length - 1 : Math.min(range.length - 1, Math.max(0, diffDays(range.lo, today)))
    const entry = byTeam.get(row.team_id)
    const values = cumulativeFromCounts(entry?.days ?? [], entry?.counts ?? [], range.lo, lastIndex).map((total) => total / row.member_count)
    const mine = row.members.includes(myName)
    return {
      id: row.team_id, label: row.members.join(' + '), color: teamColor(row.slot), values,
      width: mine ? 3.5 : 2, emphasis: mine,
      ...(row.closed ? { endText: formatScore(row.average + (row.bonus ?? 0)) } : { projection: SHOW_TEAM_PROJECTION, endLabel: true }),
    }
  })
}

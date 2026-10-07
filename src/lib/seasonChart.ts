const DAY = 86_400_000

export type ChartSeries = {
  id: string
  label: string
  color: string
  /** Cumulative value per day index, from day 0 up to and including today. */
  values: number[]
  width?: number
  muted?: boolean
  emphasis?: boolean
  projection?: boolean
  endLabel?: boolean
  /** Text shown at the end of the line when there is no projection (e.g. a final result). */
  endText?: string
}
export type RefLine = { value: number; label: string; color: string }
export type Tick = { index: number; label: string }

const utc = (date: string) => {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function diffDays(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / DAY)
}

export function addDays(date: string, days: number): string {
  return new Date(utc(date) + days * DAY).toISOString().slice(0, 10)
}

export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const total = year * 12 + (month - 1) + months
  const newYear = Math.floor(total / 12)
  const newMonth = total % 12
  const lastDay = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate()
  return `${String(newYear).padStart(4, '0')}-${String(newMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

/** First day after the season (exclusive end). */
export const seasonEnd = (start: string) => addMonths(start, 12)
export const seasonLength = (start: string) => diffDays(start, seasonEnd(start))

export type Season = { name: string; starts_on: string }

/** "Season 2026/27" for a season starting in autumn 2026. */
export function seasonOf(start: string): Season {
  const year = Number(start.slice(0, 4))
  return { name: `Season ${year}/${String((year + 1) % 100).padStart(2, '0')}`, starts_on: start }
}

/** Cumulative sessions at the end of each day index 0..lastIndex. Dates outside the range are ignored. */
export function cumulativeByDay(days: string[], start: string, lastIndex: number): number[] {
  const perDay = new Array<number>(lastIndex + 1).fill(0)
  for (const day of days) {
    const index = diffDays(start, day)
    if (index >= 0 && index <= lastIndex) perDay[index]++
  }
  let sum = 0
  return perDay.map((count) => (sum += count))
}

/** Like cumulativeByDay, for pre-aggregated data: counts[i] sessions on days[i]. */
export function cumulativeFromCounts(days: string[], counts: number[], start: string, lastIndex: number): number[] {
  const perDay = new Array<number>(lastIndex + 1).fill(0)
  days.forEach((day, position) => {
    const index = diffDays(start, day)
    if (index >= 0 && index <= lastIndex) perDay[index] += counts[position] ?? 0
  })
  let sum = 0
  return perDay.map((count) => (sum += count))
}

/** Days of recent activity that the projection is based on. */
export const PACE_WINDOW = 14

/**
 * Projected value on the last day of the period: today's value plus the pace of the last `window` days
 * (fewer while the period is younger) for each remaining day. `values` is the cumulative series up to today.
 */
export function recentPaceProjection(values: number[], totalDays: number, window = PACE_WINDOW): { rate: number; end: number } {
  const count = values.length
  if (count === 0) return { rate: 0, end: 0 }
  const last = values[count - 1]
  const windowDays = Math.min(window, count)
  const before = count - windowDays - 1 >= 0 ? values[count - windowDays - 1] : 0
  const rate = (last - before) / windowDays
  return { rate, end: last + rate * Math.max(0, totalDays - count) }
}

// Steps whose half is also a tidy number, so the middle axis label stays readable.
const NICE_STEPS = [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10]

export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = NICE_STEPS.find((candidate) => candidate * magnitude >= value - 1e-9) ?? 10
  return step * magnitude
}

/** Top of the y-axis: room for the data and the reference lines, never driven by an extrapolation. */
export function chartTop(options: { currentMax: number; refMax?: number; capFactor?: number; minScale?: number }): number {
  const { currentMax, refMax = 0, capFactor = 1.5, minScale = 5 } = options
  return niceCeil(Math.max(minScale, refMax * 1.05, currentMax * capFactor))
}

const monthName = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' })

/** Labels at the start of each month of the season. */
export function monthTicks(start: string): Tick[] {
  return Array.from({ length: 12 }, (_, month) => {
    const date = addMonths(start, month)
    return { index: diffDays(start, date), label: monthName.format(new Date(`${date}T12:00:00Z`)) }
  })
}

/** Number of days the x-axis shows: up to today plus a margin, at least `minDays`, at most the whole period. */
export function visibleDays(todayIndex: number, totalDays: number, minDays = 28): number {
  const used = todayIndex + 1
  const margin = Math.max(3, Math.round(used * 0.12))
  return Math.min(totalDays, Math.max(minDays, used + margin))
}

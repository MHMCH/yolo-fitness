import type { DailyPoints, MonthlyPoints } from '../types/database'
import type { LeaderboardRow } from './league'
import { addDays, diffDays } from './seasonChart'
import { formatScore, type MonthRange, type MonthRow, type TotalRow } from './teams'

// Text for pasting into an AI prompt. It is plain Markdown with explicit words and numbers instead of symbols,
// the rules of the game up front, and every derived fact (gaps, last 7 days, streaks, who overtook whom)
// calculated here, because language models are unreliable at arithmetic. It is the same for everybody.

const MONTH_LONG = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long' })
export const monthLong = (date: string) => MONTH_LONG.format(new Date(`${date}T12:00:00Z`))

/** Names go into table cells: no pipes or line breaks. */
export const plain = (text: string) => text.replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

function table(headers: string[], rows: string[][], numeric: number[] = []): string[] {
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`
  return [line(headers), line(headers.map((_, index) => numeric.includes(index) ? '---:' : '---')), ...rows.map(line)]
}

const placeChange = (movement: number) => movement > 0 ? `up ${movement}` : movement < 0 ? `down ${-movement}` : 'none'
const NA = 'n/a'

// ---------------------------------------------------------------------------------------------
// Facts derived from the daily sessions

/** Monday-based week number, so that weeks can be compared and counted. */
export function weekIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Math.floor((Date.UTC(year, month - 1, day) / 86_400_000 + 3) / 7)
}

/**
 * Consecutive calendar weeks (Monday to Sunday) with at least one session. The current streak counts back from this
 * week, or from last week while this week has no session yet, so it does not drop to zero every Monday.
 */
export function weeklyStreaks(days: string[], today: string): { current: number; longest: number } {
  const weeks = new Set(days.filter((day) => day <= today).map(weekIndex))
  let longest = 0
  let run = 0
  let previous = Number.NEGATIVE_INFINITY
  for (const week of [...weeks].sort((first, second) => first - second)) {
    run = week === previous + 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = week
  }
  const thisWeek = weekIndex(today)
  let cursor = weeks.has(thisWeek) ? thisWeek : thisWeek - 1
  let current = 0
  while (weeks.has(cursor)) { current++; cursor-- }
  return { current, longest }
}

/** Sessions in the last `count` days including today. */
export function sessionsInLastDays(days: string[], points: number[], today: string, count: number): number {
  const first = addDays(today, -(count - 1))
  return days.reduce((sum, day, index) => day >= first && day <= today ? sum + (points[index] ?? 0) : sum, 0)
}

export function lastSession(days: string[], points: number[], today: string): string | null {
  let latest: string | null = null
  days.forEach((day, index) => { if (day <= today && (points[index] ?? 0) > 0 && (latest === null || day > latest)) latest = day })
  return latest
}

function ago(date: string, today: string): string {
  const days = diffDays(date, today)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

/** The daily series without the sessions of today, to compare the standings with yesterday's. */
export function beforeToday(daily: DailyPoints[], today: string): DailyPoints[] {
  return daily.map((entry) => {
    const keep = entry.days.map((day, index) => ({ day, points: entry.points[index] })).filter((item) => item.day < today)
    return { user_id: entry.user_id, days: keep.map((item) => item.day), points: keep.map((item) => item.points) }
  })
}

// ---------------------------------------------------------------------------------------------
// Leaderboard

export function leaderboardForAi(rows: LeaderboardRow[], daily: DailyPoints[], season: { name: string; starts_on: string; ends_on: string }, today: string): string {
  const byUser = new Map(daily.map((entry) => [entry.user_id, entry]))
  const above = (index: number) => {
    for (let other = index - 1; other >= 0; other--) if (rows[other].total_points > rows[index].total_points) return rows[other].total_points - rows[index].total_points
    return null
  }
  const below = (index: number) => {
    for (let other = index + 1; other < rows.length; other++) if (rows[other].total_points < rows[index].total_points) return rows[index].total_points - rows[other].total_points
    return null
  }
  const body = rows.map((row, index) => {
    const entry = byUser.get(row.user_id)
    const days = entry?.days ?? []
    const points = entry?.points ?? []
    const last = lastSession(days, points, today)
    const streak = weeklyStreaks(days, today)
    const gapAbove = above(index)
    const gapBelow = below(index)
    return [String(row.rank), plain(row.display_name), String(row.total_points), String(sessionsInLastDays(days, points, today, 7)),
      placeChange(row.movement), gapAbove === null ? NA : String(gapAbove), gapBelow === null ? NA : String(gapBelow),
      last ? `${last} (${ago(last, today)})` : 'none', `${streak.current} / ${streak.longest}`]
  })
  const previous = (row: LeaderboardRow) => row.rank + row.movement
  const overtakes = rows.flatMap((row) => {
    const passed = rows.filter((other) => previous(row) > previous(other) && row.rank < other.rank).map((other) => plain(other.display_name))
    return passed.length ? [`- ${plain(row.display_name)} overtook ${passed.join(', ')}.`] : []
  })
  return [
    '# Training challenge among friends: leaderboard',
    `${season.name} (${season.starts_on} to ${season.ends_on}). One point is one workout of at least 30 minutes. The season goal is 100 sessions per person.`,
    `Data as of ${today} (Berlin time). Tied people share a place and the next place follows directly, no place is skipped.`,
    '',
    '## Standings',
    ...table(['Rank', 'Name', 'Sessions', 'Last 7 days', 'Place change vs. yesterday', 'Behind person above', 'Ahead of person below', 'Last session', 'Weekly streak now / longest'], body, [0, 2, 3, 5, 6]),
    '',
    'Weekly streak: consecutive calendar weeks (Monday to Sunday) with at least one session. "Behind person above" and "Ahead of person below" are differences in sessions to the nearest person with more or fewer sessions.',
    '',
    '## Changes since yesterday',
    ...(overtakes.length ? overtakes : ['- No place changes since yesterday.']),
  ].join('\n')
}

// ---------------------------------------------------------------------------------------------
// League

const LEAGUE_RULES = [
  'Rules: a team\'s score for a month is its sessions divided by its number of members (average per member). When a month closes (last day, 23:59 Berlin time) the top 3 teams get a bonus of +3, +2 and +1 on top of that average; teams with the same score share a place and get the same bonus, the next place follows directly (no place is skipped), and teams without any session get no bonus.',
  'A quarter\'s result is the sum of its three monthly results: closed months with bonus, the running month without bonus.',
]

export type Winner = { quarter: string; teams: string[] }
type Names = { teamName: (team: string[]) => string; personName: (id: string) => string }

const winnersSection = (winners: Winner[]) => ['', '## Quarter champions (finished quarters)',
  ...(winners.length ? winners.map((winner) => `- ${winner.quarter}: ${winner.teams.map(plain).join(' / ')}`) : ['- None yet.'])]

function gapAbove<Row extends { team: string[] }>(rows: Row[], index: number, value: (row: Row) => number): string {
  for (let other = index - 1; other >= 0; other--) {
    const difference = value(rows[other]) - value(rows[index])
    if (difference > 1e-9) return formatScore(difference)
  }
  return NA
}

export type LeagueMonthInput = Names & {
  quarter: string
  today: string
  range: MonthRange
  rows: MonthRow[]
  /** The same standings as of yesterday; null when the month started today or is not running. */
  rowsYesterday: MonthRow[] | null
  totals: TotalRow[]
  monthly: MonthlyPoints[]
  /** Earlier months of this quarter that are already closed, oldest first. */
  earlier: Array<{ month: string; rows: MonthRow[] }>
  winners: Winner[]
}

export function leagueMonthForAi(input: LeagueMonthInput): string {
  const { rows, range, today, rowsYesterday } = input
  const closed = rows.length > 0 && rows.every((row) => row.closed)
  const lastDay = addDays(range.hi, -1)
  const status = closed ? 'closed' : `running, closes ${lastDay} 23:59 Berlin time, ${Math.max(0, diffDays(today, lastDay))} days left after today`
  const previousRank = new Map((rowsYesterday ?? []).map((row) => [row.slot, row.rank]))
  const totalOf = (slot: number) => input.totals.find((total) => total.slot === slot)?.total ?? 0
  const memberPoints = (id: string) => input.monthly.find((row) => row.user_id === id && row.month === range.lo)?.points ?? 0

  const headers = closed
    ? ['Rank', 'Team', 'Members', 'Sessions', 'Average per member', 'Bonus', 'Month result', 'Quarter total so far']
    : ['Rank', 'Team', 'Members', 'Sessions', 'Average per member', 'Bonus if month ended now', 'Quarter total so far', ...(rowsYesterday ? ['Place change vs. yesterday'] : []), 'Behind team above (average)']
  const body = rows.map((row, index) => {
    const base = [String(row.rank), plain(input.teamName(row.team)), String(row.team.length), String(Math.round(row.average * row.team.length)), formatScore(row.average)]
    if (closed) return [...base, String(row.bonus), formatScore(row.average + row.bonus), formatScore(totalOf(row.slot))]
    const change = rowsYesterday ? [previousRank.has(row.slot) ? placeChange(previousRank.get(row.slot)! - row.rank) : NA] : []
    return [...base, String(row.bonus), formatScore(totalOf(row.slot)), ...change, gapAbove(rows, index, (item) => item.average)]
  })
  const members = rows.map((row) => `- ${plain(input.teamName(row.team))}: ${row.team.map((id) => `${plain(input.personName(id))} ${memberPoints(id)}`).join(', ')}`)
  const overtakes = rowsYesterday ? rows.flatMap((row) => {
    const passed = rows.filter((other) => (previousRank.get(row.slot) ?? 0) > (previousRank.get(other.slot) ?? 0) && row.rank < other.rank)
      .map((other) => plain(input.teamName(other.team)))
    return passed.length ? [`- ${plain(input.teamName(row.team))} overtook ${passed.join(', ')}.`] : []
  }) : []
  const earlier = input.earlier.flatMap(({ month, rows: monthRows }) => ['', `### ${month} (closed)`, ...table(['Rank', 'Team', 'Average per member', 'Bonus', 'Result'],
    monthRows.map((row) => [String(row.rank), plain(input.teamName(row.team)), formatScore(row.average), String(row.bonus), formatScore(row.average + row.bonus)]), [0, 2, 3, 4])])

  return [
    '# Training challenge among friends: team league',
    `${input.quarter}, ${monthLong(range.lo)} (${status}). Data as of ${today} (Berlin time).`,
    ...LEAGUE_RULES,
    '',
    '## Standings this month',
    ...table(headers, body, closed ? [0, 2, 3, 4, 5, 6, 7] : [0, 2, 3, 4, 5, 6, rowsYesterday ? 8 : 7]),
    '',
    '## Sessions per member this month',
    ...members,
    ...(rowsYesterday ? ['', '## Changes since yesterday', ...(overtakes.length ? overtakes : ['- No place changes since yesterday.'])] : []),
    ...(earlier.length ? ['', '## Earlier months of this quarter', ...earlier] : []),
    ...winnersSection(input.winners),
  ].join('\n')
}

export type LeagueTotalInput = Names & {
  quarter: string
  today: string
  monthNames: string[]
  totals: TotalRow[]
  /** Per month of the quarter. */
  monthStatus: Array<'closed' | 'running' | 'not started'>
  winners: Winner[]
}

export function leagueTotalForAi(input: LeagueTotalInput): string {
  const cell = (value: number | null, state: 'closed' | 'running' | 'not started') =>
    value === null || state === 'not started' ? 'not started' : state === 'running' ? `${formatScore(value)} (running, no bonus yet)` : formatScore(value)
  const body = input.totals.map((row, index) => [String(row.rank), plain(input.teamName(row.team)), String(row.team.length), formatScore(row.total),
    ...row.months.map((value, month) => cell(value, input.monthStatus[month])), gapAbove(input.totals, index, (item) => item.total)])
  return [
    '# Training challenge among friends: team league, quarter total',
    `${input.quarter}. Data as of ${input.today} (Berlin time).`,
    ...LEAGUE_RULES,
    '',
    '## Quarter standings',
    ...table(['Rank', 'Team', 'Members', 'Total', ...input.monthNames, 'Behind team above'], body, [0, 2, 3, 7]),
    ...winnersSection(input.winners),
  ].join('\n')
}

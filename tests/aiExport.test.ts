import { describe, expect, it } from 'vitest'
import { beforeToday, lastSession, leaderboardForAi, leagueMonthForAi, leagueTotalForAi, monthLong, plain, sessionsInLastDays, weekIndex, weeklyStreaks } from '../src/lib/aiExport'
import { monthRange, type MonthRow, type TotalRow } from '../src/lib/teams'

describe('facts from daily sessions', () => {
  it('numbers Monday-based weeks', () => {
    expect(weekIndex('2026-10-05')).toBe(weekIndex('2026-10-11'))   // Monday and Sunday of one week
    expect(weekIndex('2026-10-12')).toBe(weekIndex('2026-10-11') + 1)
  })
  it('counts the current and the longest streak of weeks with a session', () => {
    const days = ['2026-08-18', '2026-09-22', '2026-09-30', '2026-10-06']
    expect(weeklyStreaks(days, '2026-10-08')).toEqual({ current: 3, longest: 3 })
    // A Monday without a session yet does not reset the streak.
    expect(weeklyStreaks(days, '2026-10-12')).toEqual({ current: 3, longest: 3 })
    expect(weeklyStreaks(days, '2026-10-20')).toEqual({ current: 0, longest: 3 })
    expect(weeklyStreaks([], '2026-10-08')).toEqual({ current: 0, longest: 0 })
  })
  it('sums the last seven days including today and finds the last session', () => {
    const days = ['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09']
    const points = [5, 2, 1, 4]
    expect(sessionsInLastDays(days, points, '2026-10-08', 7)).toBe(3)   // 2 and 1; 10-09 lies in the future
    expect(lastSession(days, points, '2026-10-08')).toBe('2026-10-08')
    expect(lastSession([], [], '2026-10-08')).toBeNull()
  })
  it('removes the sessions of today for the comparison with yesterday', () => {
    expect(beforeToday([{ user_id: 'a', days: ['2026-10-07', '2026-10-08'], points: [1, 2] }], '2026-10-08')).toEqual([{ user_id: 'a', days: ['2026-10-07'], points: [1] }])
  })
  it('keeps table cells clean and names months in full', () => {
    expect(plain('A|B\nC')).toBe('A B C')
    expect(monthLong('2026-10-01')).toBe('October')
  })
})

describe('leaderboard export', () => {
  const season = { name: 'Season 2026/27', starts_on: '2026-10-01', ends_on: '2027-09-30' }
  const rows = [
    { user_id: 'm', display_name: 'Marco', total_points: 81, points_before_today: 79, rank: 1, movement: 2 },
    { user_id: 'j', display_name: 'Jonas', total_points: 78, points_before_today: 78, rank: 2, movement: -1 },
    { user_id: 't', display_name: 'Tobi', total_points: 70, points_before_today: 70, rank: 3, movement: -1 },
    { user_id: 'x', display_name: 'Seba', total_points: 0, points_before_today: 0, rank: 4, movement: 0 },
  ]
  const daily = [
    { user_id: 'm', days: ['2026-10-02', '2026-10-06', '2026-10-08'], points: [2, 1, 1] },
    { user_id: 'j', days: ['2026-10-01'], points: [3] },
    { user_id: 't', days: ['2026-10-07'], points: [1] },
  ]
  const text = leaderboardForAi(rows, daily, season, '2026-10-08')
  const lines = text.split('\n')

  it('explains the data and the rules first', () => {
    expect(lines[0]).toBe('# Training challenge among friends: leaderboard')
    expect(lines[1]).toContain('Season 2026/27 (2026-10-01 to 2027-09-30)')
    expect(lines[1]).toContain('at least 30 minutes')
    expect(lines[2]).toBe('Data as of 2026-10-08 (Berlin time). Tied people share a place and the next place follows directly, no place is skipped.')
  })
  it('writes one row per person with the derived facts', () => {
    expect(lines).toContain('| 1 | Marco | 81 | 4 | up 2 | n/a | 3 | 2026-10-08 (today) | 2 / 2 |')
    expect(lines).toContain('| 2 | Jonas | 78 | 0 | down 1 | 3 | 8 | 2026-10-01 (7 days ago) | 1 / 1 |')
    expect(lines).toContain('| 3 | Tobi | 70 | 1 | down 1 | 8 | 70 | 2026-10-07 (yesterday) | 1 / 1 |')
    expect(lines).toContain('| 4 | Seba | 0 | 0 | none | 70 | n/a | none | 0 / 0 |')
  })
  it('names who overtook whom, and uses no symbols or emoji', () => {
    expect(lines).toContain('- Marco overtook Jonas, Tobi.')
    expect(text).not.toMatch(/[▲▼🥇🥈🥉*]/u)
  })
  it('says so when nothing changed', () => {
    const calm = leaderboardForAi(rows.map((row) => ({ ...row, movement: 0 })), daily, season, '2026-10-08')
    expect(calm).toContain('- No place changes since yesterday.')
  })
})

describe('league export', () => {
  const range = monthRange('2026-Q4', 0)
  const names: Record<string, string> = { a: 'Anna', b: 'Ben', c: 'Cem', d: 'Dora' }
  const teamName = (team: string[]) => team.map((id) => names[id]).join(' & ')
  const personName = (id: string) => names[id]
  const row = (slot: number, team: string[], average: number, rank: number, bonus: number, closed = false): MonthRow => ({ team, slot, average, rank, bonus, started: true, closed })
  const monthly = [
    { user_id: 'a', month: '2026-10-01', points: 6 }, { user_id: 'b', month: '2026-10-01', points: 4 },
    { user_id: 'c', month: '2026-10-01', points: 2 }, { user_id: 'd', month: '2026-10-01', points: 1 },
  ]
  const totals: TotalRow[] = [
    { team: ['a', 'b'], slot: 1, months: [5, null, null], liveMonth: 0, total: 5, rank: 1 },
    { team: ['c', 'd'], slot: 2, months: [1.5, null, null], liveMonth: 0, total: 1.5, rank: 2 },
  ]
  const running = leagueMonthForAi({
    quarter: 'Q4 2026', today: '2026-10-08', range, teamName, personName, monthly, totals, winners: [{ quarter: 'Q3 2026', teams: ['Anna & Ben'] }], earlier: [],
    rows: [row(1, ['a', 'b'], 5, 1, 3), row(2, ['c', 'd'], 1.5, 2, 2)],
    rowsYesterday: [row(1, ['a', 'b'], 3, 2, 2), row(2, ['c', 'd'], 3.5, 1, 3)],
  })

  it('explains status, rules and the standings of a running month', () => {
    expect(running).toContain('Q4 2026, October (running, closes 2026-10-31 23:59 Berlin time, 23 days left after today). Data as of 2026-10-08 (Berlin time).')
    expect(running).toContain('divided by its number of members')
    expect(running).toContain('| Rank | Team | Members | Sessions | Average per member | Bonus if month ended now | Quarter total so far | Place change vs. yesterday | Behind team above (average) |')
    expect(running).toContain('| 1 | Anna & Ben | 2 | 10 | 5 | 3 | 5 | up 1 | n/a |')
    expect(running).toContain('| 2 | Cem & Dora | 2 | 3 | 1.5 | 2 | 1.5 | down 1 | 3.5 |')
  })
  it('lists the sessions of every member, who overtook whom, and the champions', () => {
    expect(running).toContain('- Anna & Ben: Anna 6, Ben 4')
    expect(running).toContain('- Cem & Dora: Cem 2, Dora 1')
    expect(running).toContain('- Anna & Ben overtook Cem & Dora.')
    expect(running).toContain('- Q3 2026: Anna & Ben')
  })
  it('writes a closed month with its final result and the earlier months', () => {
    const closed = leagueMonthForAi({
      quarter: 'Q4 2026', today: '2026-11-15', range, teamName, personName, monthly, totals, winners: [], rowsYesterday: null,
      earlier: [{ month: 'September', rows: [row(1, ['a', 'b'], 4, 1, 3, true)] }],
      rows: [row(1, ['a', 'b'], 5, 1, 3, true), row(2, ['c', 'd'], 1.5, 2, 2, true)],
    })
    expect(closed).toContain('Q4 2026, October (closed)')
    expect(closed).toContain('| Rank | Team | Members | Sessions | Average per member | Bonus | Month result | Quarter total so far |')
    expect(closed).toContain('| 1 | Anna & Ben | 2 | 10 | 5 | 3 | 8 | 5 |')
    expect(closed).toContain('### September (closed)')
    expect(closed).toContain('| 1 | Anna & Ben | 4 | 3 | 7 |')
    expect(closed).toContain('- None yet.')
    expect(closed).not.toContain('Changes since yesterday')
  })
  it('writes the quarter total with the state of every month', () => {
    const text = leagueTotalForAi({
      quarter: 'Q4 2026', today: '2026-11-15', teamName, personName, monthNames: ['October', 'November', 'December'], winners: [],
      monthStatus: ['closed', 'running', 'not started'],
      totals: [{ team: ['a', 'b'], slot: 1, months: [8, 2.5, null], liveMonth: 1, total: 10.5, rank: 1 }, { team: ['c', 'd'], slot: 2, months: [3.5, 1, null], liveMonth: 1, total: 4.5, rank: 2 }],
    })
    expect(text).toContain('| Rank | Team | Members | Total | October | November | December | Behind team above |')
    expect(text).toContain('| 1 | Anna & Ben | 2 | 10.5 | 8 | 2.5 (running, no bonus yet) | not started | n/a |')
    expect(text).toContain('| 2 | Cem & Dora | 2 | 4.5 | 3.5 | 1 (running, no bonus yet) | not started | 6 |')
  })
})

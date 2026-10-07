import { describe, expect, it } from 'vitest'
import { leaderboardRows, leaderboardText, leagueText, monthStandings, quarterLabel, quarterTable, quarterWinners, rankWithTies } from '../src/lib/league'
import type { MonthlyPoints } from '../src/types/database'

const teams = [['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1', 'c2'], ['d1', 'd2']]
const month = (date: string, points: Record<string, number>): MonthlyPoints[] =>
  Object.entries(points).map(([user_id, value]) => ({ user_id, month: date, points: value }))
const points = [
  ...month('2026-10-01', { a1: 3, a2: 3, a3: 3, b1: 4, b2: 2, c1: 2, c2: 2, d1: 1 }),
  ...month('2026-11-01', { b1: 1, b2: 1, c1: 5, c2: 3, d1: 2, d2: 2 }),
  ...month('2026-12-01', { a1: 3, a2: 3, b1: 2, d1: 1 }),
]
const byTeam = (rows: ReturnType<typeof quarterTable>) => Object.fromEntries(rows.map((row) => [row.team[0][0], row]))

describe('league scoring', () => {
  it('exports only leaderboard columns and rows in displayed order', () => {
    const rows = [
      { user_id: 'private-id-a', display_name: 'Ann|A\nB', total_points: 5, points_before_today: 4, rank: 1, movement: 2 },
      { user_id: 'private-id-b', display_name: 'Ben', total_points: 3, points_before_today: 3, rank: 2, movement: -1 },
      { user_id: 'private-id-c', display_name: 'Cem', total_points: 0, points_before_today: 0, rank: 3, movement: 0 },
    ]
    expect(leaderboardText(rows)).toBe([
      '| Rank | Name | Points | Position change |',
      '| --- | --- | --- | --- |',
      '| 1 | Ann\\|A B | 5 | 2 up |',
      '| 2 | Ben | 3 | 1 down |',
      '| 3 | Cem | 0 | Unchanged |',
    ].join('\n'))
  })
  it('exports league averages, displayed bonus, totals and chronological medals', () => {
    expect(leagueText([
      { team: ['private-id'], monthAverage: 6.333333, monthRank: 1, monthBonus: 3, quarterTotal: 12.666667, medals: [3, 1] },
      { team: ['other-id'], monthAverage: 0, monthRank: 2, monthBonus: 0, quarterTotal: 0, medals: [] },
    ], (team) => team[0] === 'private-id' ? 'Anna & Ben' : 'Cem')).toBe([
      '| Team | Month | Quarter | Wins |',
      '| --- | --- | --- | --- |',
      '| Anna & Ben | 6.3 +3 | 12.7 | Bronze, Gold |',
      '| Cem | 0.0 | 0.0 |  |',
    ].join('\n'))
  })
  it('ranks ties with shared places and skips the next place', () => {
    expect(rankWithTies([3, 3, 2, 0.5])).toEqual([1, 1, 3, 4])
  })
  it('averages by team size and gives tied teams the higher bonus', () => {
    const standings = monthStandings(teams, new Map(points.filter((row) => row.month === '2026-10-01').map((row) => [row.user_id, row.points])))
    expect(standings).toEqual([
      { average: 3, rank: 1, bonus: 3 }, { average: 3, rank: 1, bonus: 3 },
      { average: 2, rank: 3, bonus: 1 }, { average: 0.5, rank: 4, bonus: 0 },
    ])
  })
  it('adds undivided bonuses of closed months and the live current-month average', () => {
    const table = byTeam(quarterTable(teams, points, '2026-Q4', '2026-12-10'))
    expect(table.a).toMatchObject({ monthAverage: 2, quarterTotal: 8, medals: [1] })
    expect(table.b).toMatchObject({ monthAverage: 1, quarterTotal: 9, medals: [1, 3] })
    expect(table.c).toMatchObject({ monthAverage: 0, quarterTotal: 10, medals: [3, 1] })
    expect(table.d).toMatchObject({ monthAverage: 0.5, quarterTotal: 5, medals: [2] })
  })
  it('exposes the provisional rank and bonus of the current month', () => {
    const table = byTeam(quarterTable(teams, points, '2026-Q4', '2026-12-10'))
    expect([table.a, table.b, table.d, table.c].map((row) => [row.monthRank, row.monthBonus])).toEqual([[1, 3], [2, 2], [3, 1], [4, 0]])
  })
  it('gives no bonus or medal to teams without points', () => {
    expect(monthStandings([['x'], ['y'], ['z']], new Map([['x', 2]]))).toEqual([
      { average: 2, rank: 1, bonus: 3 }, { average: 0, rank: 2, bonus: 0 }, { average: 0, rank: 2, bonus: 0 },
    ])
    expect(quarterTable([['x'], ['y']], [], '2026-Q4', '2026-11-02').map((row) => [row.quarterTotal, row.medals])).toEqual([[0, []], [0, []]])
  })
  it('sorts by current month average, then quarter total', () => {
    expect(quarterTable(teams, points, '2026-Q4', '2026-12-10').map((row) => row.team[0])).toEqual(['a1', 'b1', 'd1', 'c1'])
    expect(quarterTable([['x'], ['y']], month('2026-10-01', { x: 1, y: 1 }), '2026-Q4', '2026-11-02').map((row) => row.team[0])).toEqual(['x', 'y'])
  })
  it('awards no bonus or medals before a month closes', () => {
    const table = byTeam(quarterTable(teams, points, '2026-Q4', '2026-10-31'))
    expect(table.a).toMatchObject({ monthAverage: 3, quarterTotal: 3, medals: [] })
    expect(byTeam(quarterTable(teams, points, '2026-Q4', '2026-11-01')).a).toMatchObject({ monthAverage: 0, quarterTotal: 6, medals: [1] })
  })
  it('names all tied winners of closed quarters only', () => {
    const config = { '2026-Q4': teams }
    expect(quarterWinners(config, { '2026-Q4': points }, '2026-12-31')).toEqual([])
    expect(quarterWinners(config, { '2026-Q4': points }, '2027-01-01')).toEqual([{ key: '2026-Q4', teams: [teams[0], teams[1]] }])
    expect(quarterLabel('2026-Q4')).toBe('Q4 2026')
  })
  it('ranks the leaderboard and reports movement since yesterday', () => {
    const rows = leaderboardRows([
      { user_id: 'a', display_name: 'Ann', total_points: 5, points_before_today: 5 },
      { user_id: 'b', display_name: 'Ben', total_points: 7, points_before_today: 4 },
      { user_id: 'c', display_name: 'Cem', total_points: 5, points_before_today: 3 },
    ])
    expect(rows.map(({ user_id, rank, movement }) => ({ user_id, rank, movement }))).toEqual([
      { user_id: 'b', rank: 1, movement: 1 }, { user_id: 'a', rank: 2, movement: -1 }, { user_id: 'c', rank: 2, movement: 1 },
    ])
  })
})

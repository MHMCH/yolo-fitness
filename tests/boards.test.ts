import { describe, expect, it } from 'vitest'
import { monthlyFromDaily, seasonEntries } from '../src/lib/boards'
import { leaderboardRows } from '../src/lib/league'
import type { DailyPoints, LeaderboardEntry } from '../src/types/database'

const names: LeaderboardEntry[] = ['a', 'b', 'c', 'd'].map((id) => ({ user_id: id, display_name: id.toUpperCase(), total_points: 99, points_before_today: 99 }))
const daily: DailyPoints[] = [
  { user_id: 'a', days: ['2026-10-01', '2026-10-05'], points: [5, 0] },
  { user_id: 'b', days: ['2026-10-02', '2026-10-05'], points: [4, 1] },
  { user_id: 'c', days: ['2026-10-03', '2026-11-02'], points: [4, 2] },
  { user_id: 'zzz', days: ['2026-10-03'], points: [9] },
]

describe('season totals from daily points', () => {
  it('counts the season only and separates sessions dated today', () => {
    const entries = seasonEntries(names, daily, '2026-10-05')
    expect(entries.map(({ user_id, total_points, points_before_today }) => [user_id, total_points, points_before_today])).toEqual([
      ['a', 5, 5], ['b', 5, 4], ['c', 4, 4], ['d', 0, 0]])
  })
  it('ignores accounts that are not active and sessions after today', () => {
    expect(seasonEntries(names, daily, '2026-10-05').some((entry) => entry.user_id === 'zzz')).toBe(false)
    expect(seasonEntries(names, daily, '2026-12-01').find((entry) => entry.user_id === 'c')?.total_points).toBe(6)
  })
  it('feeds the rank arrows: someone who catches up moves up, the person passed moves down', () => {
    const rows = leaderboardRows(seasonEntries(names, daily, '2026-10-05'))
    expect(rows.map(({ user_id, rank, movement }) => ({ user_id, rank, movement }))).toEqual([
      { user_id: 'a', rank: 1, movement: 0 }, { user_id: 'b', rank: 1, movement: 1 },
      { user_id: 'c', rank: 3, movement: -1 }, { user_id: 'd', rank: 4, movement: 0 }])
  })
  it('does not turn a backdated session into movement', () => {
    // Session dated yesterday but logged today: it is already in points_before_today.
    const rows = leaderboardRows(seasonEntries(names, [{ user_id: 'd', days: ['2026-10-04'], points: [9] }], '2026-10-05'))
    expect(rows.find((row) => row.user_id === 'd')).toMatchObject({ rank: 1, movement: 0 })
  })
})

describe('monthly points from daily points', () => {
  it('sums per account and month, dated the first of the month', () => {
    const rows = monthlyFromDaily(daily.filter((entry) => entry.user_id !== 'zzz'))
    expect(rows).toEqual(expect.arrayContaining([
      { user_id: 'a', month: '2026-10-01', points: 5 },
      { user_id: 'b', month: '2026-10-01', points: 5 },
      { user_id: 'c', month: '2026-10-01', points: 4 },
      { user_id: 'c', month: '2026-11-01', points: 2 },
    ]))
    expect(rows).toHaveLength(4)
  })
  it('returns nothing for an empty season', () => {
    expect(monthlyFromDaily([{ user_id: 'a', days: [], points: [] }])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildTeamSeries, dayTicks, defaultSelection, formatScore, monthLabel, monthRange, monthRows, ordinal, quarterKeys, SHOW_TEAM_PROJECTION,
  teamColor, TEAM_COLORS, totalRows,
} from '../src/lib/teams'
import type { MonthlyPoints } from '../src/types/database'

const names = (team: string[]) => team.join(' & ')
const month = (date: string, points: Record<string, number>): MonthlyPoints[] =>
  Object.entries(points).map(([user_id, value]) => ({ user_id, month: date, points: value }))

describe('calendar quarters and months', () => {
  it('computes the month of a quarter', () => {
    expect(monthRange('2026-Q4', 0)).toEqual({ lo: '2026-10-01', hi: '2026-11-01', length: 31 })
    expect(monthRange('2027-Q1', 1)).toEqual({ lo: '2027-02-01', hi: '2027-03-01', length: 28 })
  })
  it('labels months and weekly ticks', () => {
    expect(monthLabel('2026-Q3', 2)).toBe('Sep')
    expect(dayTicks('2026-10-01', 31).map((tick) => tick.label)).toEqual(['1 Oct', '8 Oct', '15 Oct', '22 Oct', '29 Oct'])
    expect(dayTicks('2027-02-01', 28).map((tick) => tick.label)).toEqual(['1 Feb', '8 Feb', '15 Feb', '22 Feb'])
  })
  it('lists quarters that have teams, oldest first', () => {
    expect(quarterKeys({ '2027-Q1': [['a']], '2026-Q4': [['a']], '2027-Q2': [] })).toEqual(['2026-Q4', '2027-Q1'])
  })
  it('opens the running quarter and month, else the latest started quarter', () => {
    const keys = ['2026-Q3', '2026-Q4', '2027-Q1']
    expect(defaultSelection(keys, '2026-11-20')).toEqual({ key: '2026-Q4', month: 1 })
    expect(defaultSelection(keys, '2026-10-01')).toEqual({ key: '2026-Q4', month: 0 })
    expect(defaultSelection(['2026-Q3', '2026-Q4'], '2027-02-03')).toEqual({ key: '2026-Q4', month: 2 })
    expect(defaultSelection(['2027-Q1'], '2026-10-05')).toEqual({ key: '2027-Q1', month: 0 })
  })
})

describe('formatting', () => {
  it('rounds to one decimal and drops a trailing zero', () => {
    expect([2, 2.04, 2.25, 6.5].map(formatScore)).toEqual(['2', '2', '2.3', '6.5'])
  })
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
  })
  it('gives each position its own colour', () => {
    expect(new Set(TEAM_COLORS).size).toBe(TEAM_COLORS.length)
    expect(teamColor(1)).not.toBe(teamColor(2))
    expect(teamColor(9)).toBe(teamColor(1))
  })
})

describe('month and quarter standings', () => {
  const teams = [['a1', 'a2', 'a3'], ['b1', 'b2'], ['c1', 'c2'], ['d1', 'd2']]
  const monthly = [
    ...month('2026-10-01', { a1: 3, a2: 3, a3: 3, b1: 4, b2: 2, c1: 2, c2: 2, d1: 1 }),
    ...month('2026-11-01', { b1: 1, b2: 1, c1: 5, c2: 3, d1: 2, d2: 2 }),
  ]
  it('ranks a closed month with ties sharing the place and the next team directly after', () => {
    const rows = monthRows(teams, monthly, monthRange('2026-Q4', 0), '2026-11-15')
    expect(rows.map((row) => [row.slot, row.average, row.rank, row.bonus, row.closed])).toEqual([
      [1, 3, 1, 3, true], [2, 3, 1, 3, true], [3, 2, 2, 2, true], [4, 0.5, 3, 1, true]])
  })
  it('shows the bonus a team would get if the running month ended now', () => {
    const rows = monthRows(teams, monthly, monthRange('2026-Q4', 1), '2026-11-15')
    expect(rows.map((row) => [row.slot, row.rank, row.bonus, row.closed, row.started])).toEqual([
      [3, 1, 3, false, true], [4, 2, 2, false, true], [2, 3, 1, false, true], [1, 4, 0, false, true]])
  })
  it('marks months that have not started', () => {
    const rows = monthRows(teams, monthly, monthRange('2026-Q4', 2), '2026-11-15')
    expect(rows.every((row) => !row.started && !row.closed)).toBe(true)
  })
  it('sums closed months with bonus and the running month without', () => {
    const rows = totalRows(teams, monthly, '2026-Q4', '2026-11-15')
    const bySlot = Object.fromEntries(rows.map((row) => [row.slot, row]))
    expect(bySlot[1].months).toEqual([6, 0, null])
    expect(bySlot[2].months).toEqual([6, 1, null])
    expect(bySlot[3].months).toEqual([4, 4, null])
    expect(bySlot[4].months).toEqual([1.5, 2, null])
    expect(bySlot[3].liveMonth).toBe(1)
    // Totals 6, 7, 8 and 3.5: every team gets its own place.
    expect(rows.map((row) => [row.slot, row.total, row.rank])).toEqual([[3, 8, 1], [2, 7, 2], [1, 6, 3], [4, 3.5, 4]])
    // Two teams on the same total share a place and the next place follows directly.
    expect(totalRows([['x'], ['y'], ['z']], [...month('2026-10-01', { x: 2, y: 2, z: 1 })], '2026-Q4', '2026-10-20').map((row) => row.rank)).toEqual([1, 1, 2])
  })
})

describe('team chart series', () => {
  const range = monthRange('2026-Q4', 0)
  const daily = [{ user_id: 'a', days: ['2026-10-02', '2026-10-04'], points: [2, 2] }, { user_id: 'b', days: ['2026-10-02'], points: [2] }]
  const row = (overrides = {}) => ({ team: ['a', 'b'], slot: 1, average: 3, rank: 1, bonus: 3, started: true, closed: false, ...overrides })
  it('builds a cumulative per-head line up to today for a running month', () => {
    const [series] = buildTeamSeries([row()], daily, range, '2026-10-05', 'zed', names)
    expect(series.values).toEqual([0, 2, 2, 3, 3])
    expect(series).toMatchObject({ projection: SHOW_TEAM_PROJECTION, endLabel: true, width: 2, emphasis: false, label: 'a & b' })
  })
  it('shows a closed month completely, with its final result and no projection', () => {
    const [series] = buildTeamSeries([row({ closed: true })], daily, range, '2026-11-20', 'zed', names)
    expect(series.values).toHaveLength(31)
    expect(series.values[30]).toBe(3)
    expect(series.projection).toBeUndefined()
    expect(series.endText).toBe('6')
  })
  it('emphasises your own team and skips months that have not started', () => {
    const rows = [row(), row({ slot: 2, team: ['zed', 'amy'], started: false })]
    expect(buildTeamSeries(rows, daily, range, '2026-10-05', 'a', names).map((series) => [series.id, series.emphasis, series.width])).toEqual([['1', true, 3.5]])
  })
  it('divides by team size, so a trio and a pair are comparable', () => {
    const trio = row({ team: ['a', 'b', 'c'] })
    const [series] = buildTeamSeries([trio], [{ user_id: 'a', days: ['2026-10-01'], points: [3] }], range, '2026-10-01', 'zed', names)
    expect(series.values).toEqual([1])
  })
})

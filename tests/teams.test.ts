import { describe, expect, it } from 'vitest'
import { buildTeamSeries, currentSelection, SHOW_TEAM_PROJECTION, dayTicks, formatScore, monthLabel, monthRange, ordinal, quarterLabel, teamColor, TEAM_COLORS } from '../src/lib/teams'
import type { TeamDaily, TeamMonthRow } from '../src/types/database'

const row = (overrides: Partial<TeamMonthRow>): TeamMonthRow => ({
  team_id: 't1', slot: 1, members: ['Ann', 'Ben'], member_count: 2, sessions: 4, average: 2, rank: 1, bonus: null, started: true, closed: false, ...overrides,
})

describe('month and quarter calendar', () => {
  it('computes the period of a month inside a quarter', () => {
    expect(monthRange('2026-08-01', 1, 3)).toEqual({ lo: '2026-10-01', hi: '2026-11-01', length: 31 })
    expect(monthRange('2026-10-01', 2, 1)).toEqual({ lo: '2027-01-01', hi: '2027-02-01', length: 31 })
    expect(monthRange('2026-10-01', 2, 2).length).toBe(28)
  })
  it('selects the quarter and month containing today', () => {
    expect(currentSelection('2026-08-01', '2026-10-07')).toEqual({ quarter: 1, month: 3 })
    expect(currentSelection('2026-10-01', '2027-02-15')).toEqual({ quarter: 2, month: 2 })
    expect(currentSelection('2026-10-01', '2026-09-30')).toBeNull()
    expect(currentSelection('2026-10-01', '2027-10-01')).toBeNull()
  })
  it('labels months, quarters and weekly ticks', () => {
    expect(monthLabel('2026-08-01', 1, 2)).toBe('Sep')
    expect(quarterLabel('2026-10-01', 2)).toBe('Jan–Mar')
    expect(dayTicks('2026-10-01', 31).map((tick) => tick.label)).toEqual(['1 Oct', '8', '15', '22', '29'])
    expect(dayTicks('2027-02-01', 28).map((tick) => tick.label)).toEqual(['1 Feb', '8', '15', '22'])
  })
})

describe('formatting', () => {
  it('rounds to one decimal and drops a trailing zero', () => {
    expect(formatScore(2)).toBe('2')
    expect(formatScore(2.04)).toBe('2')
    expect(formatScore(2.25)).toBe('2.3')
    expect(formatScore(6.5)).toBe('6.5')
  })
  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
  })
  it('gives each slot its own colour', () => {
    expect(new Set(TEAM_COLORS).size).toBe(TEAM_COLORS.length)
    expect(teamColor(1)).not.toBe(teamColor(2))
    expect(teamColor(9)).toBe(teamColor(1))
  })
})

describe('team chart series', () => {
  const range = monthRange('2026-10-01', 1, 1)
  const daily: TeamDaily[] = [{ team_id: 't1', slot: 1, days: ['2026-10-02', '2026-10-04'], counts: [2, 2] }]
  it('builds a cumulative per-head line up to today for a running month', () => {
    const [series] = buildTeamSeries([row({})], daily, range, '2026-10-05', 'Zed')
    expect(series.values).toEqual([0, 1, 1, 2, 2])
    expect(series).toMatchObject({ projection: SHOW_TEAM_PROJECTION, endLabel: true, width: 2, emphasis: false, label: 'Ann + Ben' })
  })
  it('shows a closed month completely, with its final result and no projection', () => {
    const [series] = buildTeamSeries([row({ closed: true, bonus: 3 })], daily, range, '2026-11-20', 'Zed')
    expect(series.values).toHaveLength(31)
    expect(series.values[30]).toBe(2)
    expect(series.projection).toBeUndefined()
    expect(series.endText).toBe('5')
  })
  it('emphasises your own team and skips months that have not started', () => {
    const rows = [row({}), row({ team_id: 't2', slot: 2, members: ['Zed', 'Amy'], started: false })]
    expect(buildTeamSeries(rows, daily, range, '2026-10-05', 'Ann').map((series) => [series.id, series.emphasis, series.width])).toEqual([['t1', true, 3.5]])
  })
  it('divides by team size, so a trio and a pair are comparable', () => {
    const trio = row({ team_id: 't3', members: ['A', 'B', 'C'], member_count: 3 })
    const [series] = buildTeamSeries([trio], [{ team_id: 't3', slot: 1, days: ['2026-10-01'], counts: [3] }], range, '2026-10-01', 'Zed')
    expect(series.values).toEqual([1])
  })
})

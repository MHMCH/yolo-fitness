import { describe, expect, it } from 'vitest'
import {
  addDays, addMonths, chartTop, cumulativeByDay, diffDays, niceCeil, recentPaceProjection, monthTicks, visibleDays, seasonEnd, seasonLength, seasonOf,
} from '../src/lib/seasonChart'

describe('season calendar helpers', () => {
  it('computes day differences and offsets', () => {
    expect(diffDays('2026-10-01', '2026-10-08')).toBe(7)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('adds months and clamps to month length', () => {
    expect(addMonths('2026-10-01', 3)).toBe('2027-01-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-10-01', -10)).toBe('2025-12-01')
  })
  it('knows the season length including leap years', () => {
    expect(seasonEnd('2026-10-01')).toBe('2027-10-01')
    expect(seasonLength('2026-10-01')).toBe(365)
    expect(seasonLength('2027-10-01')).toBe(366)
  })
  it('names the season after its years', () => {
    expect(seasonOf('2026-10-01')).toEqual({ name: 'Season 2026/27', starts_on: '2026-10-01' })
    expect(seasonOf('2099-04-01').name).toBe('Season 2099/00')
  })
  it('labels the month starts', () => {
    const ticks = monthTicks('2026-10-01')
    expect(ticks.map((tick) => tick.label).slice(0, 4)).toEqual(['Oct', 'Nov', 'Dec', 'Jan'])
    expect(ticks).toHaveLength(12)
    expect(ticks[1].index).toBe(31)
  })
  it('zooms the x-axis to the days so far, plus a margin', () => {
    expect(visibleDays(0, 365)).toBe(28)
    expect(visibleDays(6, 365)).toBe(28)
    expect(visibleDays(66, 365)).toBe(75)
    expect(visibleDays(200, 365)).toBe(225)
    expect(visibleDays(360, 365)).toBe(365)
    expect(visibleDays(10, 20)).toBe(20)
    expect(visibleDays(2, 31, 7)).toBe(7)
    expect(visibleDays(15, 31, 7)).toBe(19)
    expect(visibleDays(30, 31, 7)).toBe(31)
  })
})

describe('series and projection maths', () => {
  it('accumulates sessions per day and ignores dates outside the range', () => {
    const values = cumulativeByDay(['2026-10-01', '2026-10-01', '2026-10-03', '2026-09-30', '2026-10-09'], '2026-10-01', 4)
    expect(values).toEqual([2, 2, 3, 3, 3])
  })
  it('equals the overall pace while the period is younger than the window', () => {
    const values = [0, 1, 1, 2, 3, 3, 4]  // 7 days elapsed, 4 sessions
    const { rate, end } = recentPaceProjection(values, 365)
    expect(rate).toBeCloseTo(4 / 7, 5)
    expect(end).toBeCloseTo((4 / 7) * 365, 5)
  })
  it('uses only the last 14 days once the window is full', () => {
    // 30 days: 10 sessions in the first 16 days, then 2 sessions in the last 14 days
    const values = [...Array(16).fill(10), ...Array(14).fill(10)].map((value, index) => index >= 28 ? 12 : value)
    const { rate, end } = recentPaceProjection(values, 100)
    expect(rate).toBeCloseTo(2 / 14, 5)
    expect(end).toBeCloseTo(12 + (2 / 14) * 70, 5)
  })
  it('reacts to a new session and handles empty or finished periods', () => {
    const base = Array(20).fill(0)
    const withSession = [...base.slice(0, 19), 1]
    expect(recentPaceProjection(withSession, 365).end).toBeGreaterThan(recentPaceProjection(base, 365).end)
    expect(recentPaceProjection([], 365)).toEqual({ rate: 0, end: 0 })
    expect(recentPaceProjection([3, 3, 5], 3).end).toBe(5)
  })
  it('rounds up to readable axis maxima', () => {
    expect(niceCeil(0)).toBe(1)
    expect(niceCeil(7)).toBe(8)
    expect(niceCeil(105)).toBe(120)
    expect(niceCeil(120)).toBe(120)
    expect(niceCeil(13)).toBe(16)
    expect(niceCeil(25)).toBe(30)
  })
  it('caps the axis from current data and references, not from projections', () => {
    expect(chartTop({ currentMax: 4 })).toBe(6)
    expect(chartTop({ currentMax: 1 })).toBe(5)
    expect(chartTop({ currentMax: 4, refMax: 100 })).toBe(120)
    expect(chartTop({ currentMax: 90, refMax: 100 })).toBe(160)
  })
})

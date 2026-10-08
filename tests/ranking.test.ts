import { describe, expect, it } from 'vitest'
import { leaderboardRows } from '../src/lib/league'
import { buildRankingSeries, pickRivals } from '../src/lib/ranking'
import { cumulativeFromCounts } from '../src/lib/seasonChart'

describe('rival selection', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('picks one person directly above and one directly below', () => {
    expect(pickRivals(order, 'c')).toEqual([
      { id: 'b', role: 'chase', color: expect.any(String) }, { id: 'd', role: 'defend', color: expect.any(String) }])
  })
  it('takes the two nearest below the leader and the two nearest above the last place', () => {
    expect(pickRivals(order, 'a').map((rival) => [rival.id, rival.role])).toEqual([['b', 'defend'], ['c', 'defend']])
    expect(pickRivals(order, 'e').map((rival) => [rival.id, rival.role])).toEqual([['d', 'chase'], ['c', 'chase']])
  })
  it('uses different shades for two rivals on the same side', () => {
    const [first, second] = pickRivals(order, 'a')
    expect(first.color).not.toBe(second.color)
  })
  it('copes with tiny groups and unknown users', () => {
    expect(pickRivals(['a'], 'a')).toEqual([])
    expect(pickRivals(['a', 'b'], 'a').map((rival) => rival.id)).toEqual(['b'])
    expect(pickRivals(order, 'zzz')).toEqual([])
  })
})

describe('leaderboard series', () => {
  it('accumulates pre-aggregated counts', () => {
    expect(cumulativeFromCounts(['2026-10-01', '2026-10-03', '2026-09-30'], [2, 1, 5], '2026-10-01', 3)).toEqual([2, 2, 3, 3])
  })
  it('colours you and your rivals, mutes the rest and highlights a picked person', () => {
    const rows = leaderboardRows([
      { user_id: 'a', display_name: 'Ann', total_points: 5, points_before_today: 5 },
      { user_id: 'b', display_name: 'Ben', total_points: 4, points_before_today: 4 },
      { user_id: 'c', display_name: 'Cem', total_points: 3, points_before_today: 3 },
      { user_id: 'd', display_name: 'Dan', total_points: 2, points_before_today: 2 },
      { user_id: 'e', display_name: 'Eve', total_points: 1, points_before_today: 1 },
    ])
    const { series, rivals } = buildRankingSeries(rows, [{ user_id: 'b', days: ['2026-10-02'], points: [4] }], 'c', 'e', '2026-10-01', 2)
    expect(rivals.map((rival) => rival.id)).toEqual(['b', 'd'])
    const byId = Object.fromEntries(series.map((entry) => [entry.id, entry]))
    expect(byId.c).toMatchObject({ color: 'var(--pink)', width: 3, emphasis: true })
    expect(byId.b.emphasis).toBe(true)
    expect(byId.b.values).toEqual([0, 4, 4])
    expect(byId.a.muted).toBe(true)
    expect(byId.e.muted).toBeUndefined()
    expect(byId.e.emphasis).toBe(true)
    expect(byId.a.values).toEqual([0, 0, 0])
  })
})

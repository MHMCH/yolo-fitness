import { describe, expect, it } from 'vitest'
import { buildRankingSeries, orderRows, pickRivals, type RankingRow } from '../src/lib/ranking'
import { cumulativeFromCounts } from '../src/lib/seasonChart'

const row = (user_id: string, display_name: string, sessions: number, rank: number): RankingRow => ({ user_id, display_name, sessions, rank, last_year_count: null })

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

describe('ranking series', () => {
  it('orders by rank, then name', () => {
    expect(orderRows([row('x', 'Zed', 3, 2), row('y', 'Amy', 3, 2), row('z', 'Bob', 9, 1)]).map((entry) => entry.display_name)).toEqual(['Bob', 'Amy', 'Zed'])
  })
  it('accumulates pre-aggregated counts', () => {
    expect(cumulativeFromCounts(['2026-10-01', '2026-10-03', '2026-09-30'], [2, 1, 5], '2026-10-01', 3)).toEqual([2, 2, 3, 3])
  })
  it('colours you and your rivals, mutes the rest and highlights a picked person', () => {
    const rows = [row('a', 'Ann', 5, 1), row('b', 'Ben', 4, 2), row('c', 'Cem', 3, 3), row('d', 'Dan', 2, 4), row('e', 'Eve', 1, 5)]
    const { series, rivals } = buildRankingSeries(rows, [{ user_id: 'b', days: ['2026-10-02'], counts: [4] }], 'c', 'e', '2026-10-01', 2)
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

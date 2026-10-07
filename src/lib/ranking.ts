import { cumulativeFromCounts, type ChartSeries } from './seasonChart'
import type { DailySeries, RankingRow } from '../types/database'

export type { DailySeries, RankingRow }
export type Rival = { id: string; role: 'chase' | 'defend'; color: string }

const CHASE = ['#ffb454', '#ffd596']
const DEFEND = ['#5ac8fa', '#a2dcf5']
export const MUTED_COLOR = '#8a8c96'
export const PICKED_COLOR = '#c8a2ff'

export function orderRows(rows: RankingRow[]): RankingRow[] {
  return [...rows].sort((first, second) => first.rank - second.rank || first.display_name.localeCompare(second.display_name))
}

/** The people directly above and below `me` in the ordered list; at either end, the two nearest on the other side. */
export function pickRivals(order: string[], me: string): Rival[] {
  const index = order.indexOf(me)
  if (index < 0) return []
  let above = order.slice(Math.max(0, index - 2), index).reverse()
  let below = order.slice(index + 1, index + 3)
  if (above.length && below.length) { above = above.slice(0, 1); below = below.slice(0, 1) }
  return [
    ...above.map((id, nth): Rival => ({ id, role: 'chase', color: CHASE[nth] })),
    ...below.map((id, nth): Rival => ({ id, role: 'defend', color: DEFEND[nth] })),
  ]
}

/**
 * One cumulative line per person. You and your two rivals are coloured and extrapolated;
 * everyone else is a thin grey line. A tapped person (picked) is highlighted as well.
 */
export function buildRankingSeries(rows: RankingRow[], daily: DailySeries[], me: string, picked: string | null,
  start: string, todayIndex: number): { series: ChartSeries[]; rivals: Rival[] } {
  const ordered = orderRows(rows)
  const rivals = pickRivals(ordered.map((row) => row.user_id), me)
  const byUser = new Map(daily.map((entry) => [entry.user_id, entry]))
  const series = ordered.map((row): ChartSeries => {
    const entry = byUser.get(row.user_id)
    const values = cumulativeFromCounts(entry?.days ?? [], entry?.counts ?? [], start, todayIndex)
    const base = { id: row.user_id, label: row.display_name, values }
    if (row.user_id === me) return { ...base, color: 'var(--pink)', width: 3, emphasis: true }
    const rival = rivals.find((candidate) => candidate.id === row.user_id)
    if (rival) return { ...base, color: rival.color, width: 2, emphasis: true }
    if (row.user_id === picked) return { ...base, color: PICKED_COLOR, width: 2, emphasis: true }
    return { ...base, color: MUTED_COLOR, width: 1.25, muted: true }
  })
  return { series, rivals }
}

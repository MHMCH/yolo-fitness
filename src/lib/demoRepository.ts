import { berlinDate, monthBounds, quarterBounds } from './trainingDates'
import type { SessionRepository } from './sessionRepository'
import type { BoardRepository } from './boardRepository'
import type { LeagueConfig } from '../config/league'
import type { MonthlyPoints, TrainingSession } from '../types/database'

const friends = [
  { id: 'demo-sam', name: 'Sam', total: 41, today: 1, quarter: [9, 7, 6] },
  { id: 'demo-mia', name: 'Mia', total: 35, today: 0, quarter: [6, 8, 4] },
  { id: 'demo-leo', name: 'Leo', total: 30, today: 2, quarter: [7, 5, 3] },
  { id: 'demo-ida', name: 'Ida', total: 12, today: 0, quarter: [4, 6, 5] },
  { id: 'demo-tom', name: 'Tom', total: 12, today: 1, quarter: [8, 3, 2] },
  { id: 'demo-ana', name: 'Ana', total: 8, today: 0, quarter: [3, 4, 7] },
]

export function demoLeague(): LeagueConfig {
  const current = quarterBounds(berlinDate())
  const previous = quarterBounds(new Date(Date.parse(`${current.start}T12:00:00Z`) - 86400000).toISOString().slice(0, 10))
  return {
    [previous.key]: [['local-preview', 'demo-leo'], ['demo-sam', 'demo-ida'], ['demo-mia', 'demo-tom', 'demo-ana']],
    [current.key]: [['local-preview', 'demo-sam', 'demo-mia'], ['demo-leo', 'demo-ida'], ['demo-tom', 'demo-ana']],
  }
}

export function createDemoRepository(): SessionRepository & BoardRepository {
  const today = berlinDate()
  const rows: TrainingSession[] = Array.from({ length: 12 }, (_, index) => ({
    id: crypto.randomUUID(), user_id: 'local-preview',
    trained_on: index < 4 ? today : `${Number(today.slice(0, 4)) - 1}-09-15`,
    created_at: new Date(Date.now() - index * 86400000).toISOString(),
  }))
  return {
    async leaderboard() {
      const current = berlinDate()
      return [
        { user_id: 'local-preview', display_name: 'Alex', total_points: rows.length, points_before_today: rows.filter((row) => row.trained_on < current).length },
        ...friends.map((friend) => ({ user_id: friend.id, display_name: friend.name, total_points: friend.total, points_before_today: friend.total - friend.today })),
      ]
    },
    async monthlyPoints(from, to) {
      const current = berlinDate()
      const result: MonthlyPoints[] = []
      quarterBounds(from).months.forEach((month, index) => {
        if (month >= to || month > current) return
        const { end } = monthBounds(month)
        result.push({ user_id: 'local-preview', month, points: rows.filter((row) => row.trained_on >= month && row.trained_on < end).length })
        for (const friend of friends) result.push({ user_id: friend.id, month, points: friend.quarter[index] })
      })
      return result
    },
    async summary() {
      const current = berlinDate()
      const bounds = monthBounds(current)
      return { today: current, total_count: rows.length,
        month_count: rows.filter((row) => row.trained_on >= bounds.start && row.trained_on < bounds.end).length }
    },
    async history(offset) {
      return [...rows].sort((first, second) => second.trained_on.localeCompare(first.trained_on)
        || second.created_at.localeCompare(first.created_at) || second.id.localeCompare(first.id)).slice(offset, offset + 20)
    },
    async find(id) { return rows.find((row) => row.id === id) ?? null },
    async insert(request) {
      if (rows.some((row) => row.id === request.id)) throw new Error('Duplicate entry.')
      rows.unshift({ ...request, trained_on: request.trained_on ?? berlinDate(), user_id: 'local-preview', created_at: new Date().toISOString() })
    },
    async remove(id) {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
    },
  }
}
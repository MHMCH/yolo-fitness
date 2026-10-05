import { berlinDate, monthBounds } from './trainingDates'
import type { SessionRepository } from './sessionRepository'
import type { TrainingSession } from '../types/database'

export function createDemoRepository(): SessionRepository {
  const today = berlinDate()
  const rows: TrainingSession[] = Array.from({ length: 12 }, (_, index) => ({
    id: crypto.randomUUID(), user_id: 'local-preview',
    trained_on: index < 4 ? today : `${Number(today.slice(0, 4)) - 1}-09-15`,
    created_at: new Date(Date.now() - index * 86400000).toISOString(),
  }))
  return {
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
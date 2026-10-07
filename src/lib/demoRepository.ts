import type { AppConfig } from '../config'
import { addDays, addMonths, seasonEnd } from './seasonChart'
import type { BoardRepository } from './boardRepository'
import type { SeasonRepository } from './seasonRepository'
import type { SessionRepository } from './sessionRepository'
import { berlinDate, monthBounds, quarterBounds } from './trainingDates'
import { newId } from './uuid'
import type { DailyPoints, LeaderboardEntry, TrainingSession } from '../types/database'

const earlierDaysAgo = [2, 3, 5, 6, 9, 10, 12, 15, 17, 18, 21, 24, 26, 30, 33, 35, 40, 44, 47]

const demoPeople: Array<[string, number]> = [
  ['Marco', 2.8], ['Daniel', 1.2], ['Jens', 1.9], ['Jonas', 2.4], ['Seba', 0.8],
  ['Philipp', 2.1], ['Axel', 1.5], ['Jörg', 1.0], ['Tobi', 2.6], ['Torben', 1.7],
]

/** Small deterministic generator so the demo looks the same on every reload. */
function random(seed: number) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
}

export function createDemo(): { sessions: SessionRepository; season: SeasonRepository; boards: BoardRepository; config: AppConfig } {
  const today = berlinDate()
  // The demo season began two quarters ago, so two quarters are finished and have a champion.
  const seasonStart = addMonths(quarterBounds(today).start, -6)
  const rows: TrainingSession[] = [
    ...Array.from({ length: 12 }, (_, index) => ({
      id: newId(), user_id: 'local-preview',
      trained_on: index < 4 ? today : `${Number(today.slice(0, 4)) - 1}-09-15`,
      created_at: new Date(Date.now() - index * 86400000).toISOString(),
    })),
    ...earlierDaysAgo.map((ago) => ({
      id: newId(), user_id: 'local-preview', trained_on: addDays(today, -ago),
      created_at: new Date(Date.now() - ago * 86400000).toISOString(),
    })),
  ]
  const sessions: SessionRepository = {
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
  const ownDays = (start: string) => {
    const end = seasonEnd(start)
    return rows.map((row) => row.trained_on).filter((day) => day >= start && day < end).sort()
  }
  const season: SeasonRepository = { async ownDays(start) { return ownDays(start) } }

  const people = demoPeople.map(([name, rate], index) => {
    const next = random(index + 7)
    const days: string[] = []
    for (let offset = 0; addDays(seasonStart, offset) <= today; offset++) {
      const day = addDays(seasonStart, offset)
      const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
      if (next() < (rate / 7) * (weekend ? 1.35 : 0.93)) days.push(day)
    }
    return { id: `demo-${index}`, name, days }
  })
  const everyone = () => [{ id: 'local-preview', name: 'Alex', days: ownDays(seasonStart) }, ...people]
  const boards: BoardRepository = {
    async leaderboard() {
      return everyone().map((person): LeaderboardEntry => ({ user_id: person.id, display_name: person.name, total_points: person.days.length, points_before_today: 0 }))
    },
    async dailyPoints(from, to) {
      return everyone().map((person): DailyPoints => {
        const perDay = new Map<string, number>()
        for (const day of person.days) if (day >= from && day < to) perDay.set(day, (perDay.get(day) ?? 0) + 1)
        const days = [...perDay.keys()].sort()
        return { user_id: person.id, days, points: days.map((day) => perDay.get(day)!) }
      })
    },
  }

  // Five teams per quarter from the same eleven people, shuffled differently each quarter.
  const ids = ['local-preview', ...people.map((person) => person.id)]
  const league: AppConfig['league'] = {}
  for (let start = seasonStart, quarter = 0; start <= today; start = addMonths(start, 3), quarter++) {
    const order = ids.map((_, index) => ids[(index * (quarter + 2) + quarter) % ids.length])
    const unique = [...new Set(order)]
    const shuffled = unique.length === ids.length ? unique : ids
    league[quarterBounds(start).key] = [shuffled.slice(0, 3), shuffled.slice(3, 5), shuffled.slice(5, 7), shuffled.slice(7, 9), shuffled.slice(9, 11)]
  }
  return { sessions, season, boards, config: { seasonStart, league } }
}

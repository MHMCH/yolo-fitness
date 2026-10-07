import { berlinDate, monthBounds } from './trainingDates'
import { addDays, addMonths, seasonEnd } from './seasonChart'
import type { RankingRepository } from './rankingRepository'
import type { TeamsRepository } from './teamsRepository'
import type { TeamAdminRepository } from './teamAdminRepository'
import type { SeasonRepository } from './seasonRepository'
import type { SessionRepository } from './sessionRepository'
import type { DailySeries, RankingRow, TeamDaily, TeamMonthRow, TeamQuarterRow, TrainingSession } from '../types/database'

const earlierDaysAgo = [2, 3, 5, 6, 9, 10, 12, 15, 17, 18, 21, 24, 26, 30, 33, 35, 40, 44, 47]

const demoPeople: Array<[string, number, number]> = [
  ['Marco', 2.8, 120], ['Daniel', 1.2, 55], ['Jens', 1.9, 80], ['Jonas', 2.4, 96], ['Seba', 0.8, 30],
  ['Philipp', 2.1, 90], ['Axel', 1.5, 64], ['Jörg', 1.0, 48], ['Tobi', 2.6, 110], ['Torben', 1.7, 70],
]

/** Small deterministic generator so the demo looks the same on every reload. */
function random(seed: number) {
  let state = seed
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 }
}

export function createDemo(): { sessions: SessionRepository; season: SeasonRepository; ranking: RankingRepository; teams: TeamsRepository; teamAdmin: TeamAdminRepository } {
  const today = berlinDate()
  const seasonStart = addDays(today, -60)
  const rows: TrainingSession[] = [
    ...Array.from({ length: 12 }, (_, index) => ({
      id: crypto.randomUUID(), user_id: 'local-preview',
      trained_on: index < 4 ? today : `${Number(today.slice(0, 4)) - 1}-09-15`,
      created_at: new Date(Date.now() - index * 86400000).toISOString(),
    })),
    ...earlierDaysAgo.map((ago) => ({
      id: crypto.randomUUID(), user_id: 'local-preview', trained_on: addDays(today, -ago),
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
  const season: SeasonRepository = {
    async season() { return { id: 1, name: 'Demo season', starts_on: seasonStart } },
    async ownDays(active) {
      const end = seasonEnd(active.starts_on)
      return rows.map((row) => row.trained_on).filter((day) => day >= active.starts_on && day < end).sort()
    },
  }
  const people = demoPeople.map(([name, rate, lastYear], index) => {
    const next = random(index + 7)
    const days: string[] = []
    for (let offset = 0; offset <= 60; offset++) {
      const day = addDays(seasonStart, offset)
      const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay())
      if (next() < (rate / 7) * (weekend ? 1.35 : 0.93)) days.push(day)
    }
    return { id: `demo-${index}`, name, lastYear, days }
  })
  const seasonDays = () => {
    const end = seasonEnd(seasonStart)
    return rows.map((row) => row.trained_on).filter((day) => day >= seasonStart && day < end).sort()
  }
  const everyone = () => [
    { id: 'local-preview', name: 'Alex', lastYear: 40, days: seasonDays() },
    ...people,
  ]
  const ranking: RankingRepository = {
    async ranking() {
      const counted = everyone().map((person) => ({ user_id: person.id, display_name: person.name, sessions: person.days.length, last_year_count: person.lastYear }))
      const distinct = [...new Set(counted.map((entry) => entry.sessions))].sort((first, second) => second - first)
      return counted.map((entry): RankingRow => ({ ...entry, rank: distinct.indexOf(entry.sessions) + 1 }))
    },
    async daily() {
      return everyone().map((person): DailySeries => {
        const perDay = new Map<string, number>()
        for (const day of person.days) perDay.set(day, (perDay.get(day) ?? 0) + 1)
        const days = [...perDay.keys()].sort()
        return { user_id: person.id, days, counts: days.map((day) => perDay.get(day)!) }
      })
    },
  }
  // Quarter 1 has five teams; the other quarters have none, to show the empty state.
  const teamDefsByQuarter = new Map<number, string[][]>([[1, [['Alex', 'Marco'], ['Daniel', 'Jens'], ['Jonas', 'Seba', 'Philipp'], ['Axel', 'Jörg'], ['Tobi', 'Torben']]]])
  const denseRank = (values: number[], value: number) => [...new Set(values.map((entry) => Math.round(entry * 1e9)))].sort((a, b) => b - a).indexOf(Math.round(value * 1e9)) + 1
  function monthRows(quarter: number, month: number): TeamMonthRow[] {
    const teamDefs = teamDefsByQuarter.get(quarter) ?? []
    if (!teamDefs.length) return []
    const lo = addMonths(seasonStart, (quarter - 1) * 3 + month - 1)
    const hi = addMonths(seasonStart, (quarter - 1) * 3 + month)
    const byName = new Map(everyone().map((person) => [person.name, person.days]))
    const raw = teamDefs.map((members, index) => {
      const sessions = members.flatMap((name) => byName.get(name) ?? []).filter((day) => day >= lo && day < hi).length
      return { members, slot: index + 1, sessions, average: sessions / members.length }
    })
    const averages = raw.map((entry) => entry.average)
    return raw.map((entry): TeamMonthRow => {
      const rank = denseRank(averages, entry.average)
      const closed = today >= hi
      return { team_id: `demo-team-${entry.slot}`, slot: entry.slot, members: [...entry.members].sort(), member_count: entry.members.length,
        sessions: entry.sessions, average: entry.average, rank, bonus: closed && rank <= 3 ? 4 - rank : null, started: today >= lo, closed }
    }).sort((a, b) => a.rank - b.rank || a.slot - b.slot)
  }
  const teams: TeamsRepository = {
    async month(quarter, month) { return monthRows(quarter, month) },
    async daily(quarter, month) {
      const teamDefs = teamDefsByQuarter.get(quarter) ?? []
      const lo = addMonths(seasonStart, (quarter - 1) * 3 + month - 1)
      const hi = addMonths(seasonStart, (quarter - 1) * 3 + month)
      const byName = new Map(everyone().map((person) => [person.name, person.days]))
      return teamDefs.map((members, index): TeamDaily => {
        const perDay = new Map<string, number>()
        for (const day of members.flatMap((name) => byName.get(name) ?? [])) if (day >= lo && day < hi) perDay.set(day, (perDay.get(day) ?? 0) + 1)
        const days = [...perDay.keys()].sort()
        return { team_id: `demo-team-${index + 1}`, slot: index + 1, days, counts: days.map((day) => perDay.get(day)!) }
      })
    },
    async quarter(quarter) {
      const teamDefs = teamDefsByQuarter.get(quarter) ?? []
      if (!teamDefs.length) return []
      const perMonth = [1, 2, 3].map((month) => monthRows(quarter, month))
      const rows = teamDefs.map((members, index) => {
        const entries = perMonth.map((list) => list.find((row) => row.slot === index + 1)!)
        return { team_id: `demo-team-${index + 1}`, slot: index + 1, members: [...members].sort(), member_count: members.length,
          scores: entries.map((entry) => entry.started ? entry.average : null), bonuses: entries.map((entry) => entry.bonus),
          total: entries.reduce((sum, entry) => sum + (entry.started ? entry.average + (entry.bonus ?? 0) : 0), 0) }
      })
      const totals = rows.map((row) => row.total)
      return rows.map((row): TeamQuarterRow => ({ ...row, rank: denseRank(totals, row.total) })).sort((a, b) => a.rank - b.rank || a.slot - b.slot)
    },
  }
  const teamAdmin: TeamAdminRepository = {
    async people() { return everyone().map((person) => ({ id: person.id, name: person.name })) },
    async assignments(_season, quarter) {
      const result: Record<string, number | null> = {}
      for (const [index, members] of (teamDefsByQuarter.get(quarter) ?? []).entries()) {
        for (const name of members) result[everyone().find((person) => person.name === name)!.id] = index + 1
      }
      return result
    },
    async save(quarter, lists) {
      const nameOf = new Map(everyone().map((person) => [person.id, person.name]))
      teamDefsByQuarter.set(quarter, lists.map((ids) => ids.map((id) => nameOf.get(id)!)))
    },
  }
  return { sessions, season, ranking, teams, teamAdmin }
}

export const createDemoRepository = () => createDemo().sessions

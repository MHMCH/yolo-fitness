import { computed, ref, watch, type Ref } from 'vue'
import { league, type LeagueConfig } from '../config/league'
import { boardRepository, type BoardRepository } from '../lib/boardRepository'
import { leaderboardRows, quarterStart, quarterTable, quarterWinners } from '../lib/league'
import { berlinDate, quarterBounds } from '../lib/trainingDates'
import type { LeaderboardEntry, MonthlyPoints } from '../types/database'

export function useBoards(identity: Ref<string>, repository: () => BoardRepository = () => boardRepository,
  config: () => LeagueConfig = () => league, today: () => string = berlinDate) {
  const entries = ref<LeaderboardEntry[]>([])
  const points = ref<Record<string, MonthlyPoints[]>>({})
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  let generation = 0
  const quarter = computed(() => quarterBounds(today()).key)
  async function refresh() {
    if (!identity.value) return
    const current = ++generation
    loading.value = true
    error.value = ''
    try {
      const teams = config()
      const keys = Object.keys(teams).filter((key) => teams[key].length && quarterStart(key) <= today())
      const [board, ...quarters] = await Promise.all([repository().leaderboard(), ...keys.map((key) => {
        const bounds = quarterBounds(quarterStart(key))
        return repository().monthlyPoints(bounds.start, bounds.end)
      })])
      if (current !== generation) return
      entries.value = board
      points.value = Object.fromEntries(keys.map((key, index) => [key, quarters[index]]))
      loaded.value = true
    } catch {
      if (current === generation) error.value = 'Could not load the boards. Check your connection and try again.'
    } finally { if (current === generation) loading.value = false }
  }
  watch(identity, () => {
    generation++
    entries.value = []
    points.value = {}
    loaded.value = false
    loading.value = false
    error.value = ''
  })
  const names = computed(() => new Map(entries.value.map((entry) => [entry.user_id, entry.display_name])))
  const leaderboard = computed(() => leaderboardRows(entries.value))
  const table = computed(() => quarterTable(config()[quarter.value] ?? [], points.value[quarter.value] ?? [], quarter.value, today()))
  const winners = computed(() => quarterWinners(config(), points.value, today()))
  const teamName = (team: string[]) => team.map((id) => names.value.get(id) ?? 'Unknown').join(' & ')
  return { quarter, leaderboard, table, winners, loaded, loading, error, refresh, teamName }
}

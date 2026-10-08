import { computed, ref, watch, type Ref } from 'vue'
import type { AppConfig } from '../config'
import { boardRepository, type BoardRepository } from '../lib/boardRepository'
import { monthlyFromDaily, seasonEntries } from '../lib/boards'
import { leaderboardRows, quarterWinners } from '../lib/league'
import { seasonEnd } from '../lib/seasonChart'
import type { DailyPoints, LeaderboardEntry } from '../types/database'

/**
 * Season data for the Leaderboard and League screens: who is active, and every account's sessions per day
 * across the season. Everything else (totals, rank movement, team averages, bonuses, winners) is derived here.
 * Loads while `active` is true and reloads when `refreshKey` changes.
 */
export function useBoards(identity: Ref<string>, active: Ref<boolean>, refreshKey: Ref<unknown>, config: () => AppConfig,
  today: () => string, repository: () => BoardRepository = () => boardRepository) {
  const names = ref<LeaderboardEntry[]>([])
  const daily = ref<DailyPoints[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  let sequence = 0

  async function refresh() {
    const current = ++sequence
    if (!identity.value) return
    loading.value = true
    error.value = ''
    try {
      const { seasonStart } = config()
      const [people, series] = await Promise.all([repository().leaderboard(), repository().dailyPoints(seasonStart, seasonEnd(seasonStart))])
      if (current !== sequence) return
      names.value = people
      daily.value = series
      loaded.value = true
    } catch {
      if (current === sequence) error.value = 'Could not load the boards. Check your connection and try again.'
    } finally { if (current === sequence) loading.value = false }
  }
  watch(identity, () => { sequence++; names.value = []; daily.value = []; loaded.value = false; loading.value = false; error.value = '' })
  watch([identity, active, refreshKey], () => { if (active.value) void refresh() }, { immediate: true })

  const nameOf = computed(() => new Map(names.value.map((entry) => [entry.user_id, entry.display_name])))
  const leaderboard = computed(() => leaderboardRows(seasonEntries(names.value, daily.value, today())))
  const monthly = computed(() => monthlyFromDaily(daily.value))
  const teamName = (team: string[]) => team.map((id) => nameOf.value.get(id) ?? 'Unknown').join(' & ')
  const winners = computed(() => {
    const league = config().league
    return quarterWinners(league, Object.fromEntries(Object.keys(league).map((key) => [key, monthly.value])), today())
  })
  return { names, daily, loaded, loading, error, leaderboard, monthly, winners, teamName, refresh }
}

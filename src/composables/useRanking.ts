import { ref, watch, type Ref } from 'vue'
import { rankingRepository, type RankingRepository } from '../lib/rankingRepository'
import type { DailySeries, RankingRow } from '../types/database'

/** Loads season rankings while the Ranking view is open; reloads when `refreshKey` changes. */
export function useRanking(identity: Ref<string>, active: Ref<boolean>, refreshKey: Ref<unknown>,
  repository: () => RankingRepository = () => rankingRepository) {
  const rows = ref<RankingRow[]>([])
  const daily = ref<DailySeries[]>([])
  const loading = ref(false)
  const error = ref('')
  let sequence = 0
  async function load() {
    const current = ++sequence
    if (!identity.value) { rows.value = []; daily.value = []; loading.value = false; return }
    loading.value = true
    error.value = ''
    try {
      const [ranking, series] = await Promise.all([repository().ranking(), repository().daily()])
      if (current !== sequence) return
      rows.value = ranking
      daily.value = series
    } catch {
      if (current === sequence) error.value = 'Could not load the ranking. Check your connection and try again.'
    } finally { if (current === sequence) loading.value = false }
  }
  watch(identity, () => { sequence++; rows.value = []; daily.value = []; error.value = ''; loading.value = false })
  watch([identity, active, refreshKey], () => { if (active.value) void load() }, { immediate: true })
  return { rows, daily, loading, error, reload: load }
}

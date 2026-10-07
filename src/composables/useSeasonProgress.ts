import { ref, watch, type Ref } from 'vue'
import { seasonRepository, type SeasonRepository } from '../lib/seasonRepository'
import type { Season } from '../types/database'

/** Loads the current season and the user's own session dates; reloads when `refreshKey` changes. */
export function useSeasonProgress(identity: Ref<string>, refreshKey: Ref<unknown>, repository: () => SeasonRepository = () => seasonRepository) {
  const season = ref<Season | null>(null)
  const days = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  let sequence = 0
  async function load() {
    const current = ++sequence
    if (!identity.value) { season.value = null; days.value = []; loading.value = false; return }
    loading.value = true
    error.value = ''
    try {
      const active = await repository().season()
      const entries = active ? await repository().ownDays(active) : []
      if (current !== sequence) return
      season.value = active
      days.value = entries
    } catch {
      if (current === sequence) error.value = 'Could not load your season progress.'
    } finally { if (current === sequence) loading.value = false }
  }
  watch(identity, () => { season.value = null; days.value = [] })
  watch([identity, refreshKey], () => { void load() }, { immediate: true })
  return { season, days, loading, error, reload: load }
}

import { computed, ref, watch, type Ref } from 'vue'
import { seasonOf } from '../lib/seasonChart'
import { seasonRepository, type SeasonRepository } from '../lib/seasonRepository'

/** The user's own session dates in the season; reloads when `refreshKey` changes. */
export function useSeasonProgress(identity: Ref<string>, refreshKey: Ref<unknown>, start: () => string,
  repository: () => SeasonRepository = () => seasonRepository) {
  const season = computed(() => seasonOf(start()))
  const days = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  let sequence = 0
  async function load() {
    const current = ++sequence
    if (!identity.value) { days.value = []; loading.value = false; return }
    loading.value = true
    error.value = ''
    try {
      const entries = await repository().ownDays(start())
      if (current !== sequence) return
      days.value = entries
    } catch {
      if (current === sequence) error.value = 'Could not load your season progress.'
    } finally { if (current === sequence) loading.value = false }
  }
  watch(identity, () => { days.value = [] })
  watch([identity, refreshKey], () => { void load() }, { immediate: true })
  return { season, days, loading, error, reload: load }
}

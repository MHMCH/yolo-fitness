import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { berlinDate, validTrainingDate } from '../lib/trainingDates'
import { commitSession, sessionRepository, type InsertRequest, type SessionRepository } from '../lib/sessionRepository'
import type { Summary, TrainingSession } from '../types/database'

export function useTrainingSessions(identity: Ref<string>, repository: () => SessionRepository = () => sessionRepository) {
  const summary = ref<Summary | null>(null)
  const history = ref<TrainingSession[]>([])
  const more = ref(false)
  const loading = ref(false)
  const busy = ref(false)
  const online = ref(navigator.onLine)
  const message = ref('')
  const error = ref('')
  const pending = ref<InsertRequest | null>(null)
  let generation = 0
  let refreshSequence = 0
  const today = computed(() => summary.value?.today ?? berlinDate())
  const pendingKey = () => `yolo-fitness:pending:${identity.value}`
  function persistPending(request: InsertRequest | null) {
    if (identity.value === 'local-preview') return
    if (request) localStorage.setItem(pendingKey(), JSON.stringify(request))
    else localStorage.removeItem(pendingKey())
  }
  async function refresh() {
    if (!identity.value || busy.value) return
    const current = generation
    const sequence = ++refreshSequence
    loading.value = true
    error.value = ''
    try {
      const [stats, entries] = await Promise.all([repository().summary(), repository().history(0)])
      if (current !== generation || sequence !== refreshSequence) return
      summary.value = stats
      history.value = entries
      more.value = entries.length === 20
    } catch {
      if (current === generation && sequence === refreshSequence) error.value = 'Could not refresh your sessions. Check your connection and try again.'
    } finally { if (current === generation && sequence === refreshSequence) loading.value = false }
  }
  watch(identity, () => {
    generation++
    summary.value = null
    history.value = []
    pending.value = null
    error.value = ''
    message.value = ''
    busy.value = false
    loading.value = false
    more.value = false
    if (identity.value && identity.value !== 'local-preview') {
      try {
        const saved = JSON.parse(localStorage.getItem(pendingKey()) ?? 'null') as InsertRequest | null
        if (saved && /^[0-9a-f-]{36}$/i.test(saved.id) && (!saved.trained_on || validTrainingDate(saved.trained_on, berlinDate()))) pending.value = saved
      } catch { error.value = 'Browser storage is unavailable. Enable site storage before logging.' }
    }
    void refresh()
  }, { immediate: true })
  async function log(date?: string) {
    if (busy.value || loading.value || !identity.value) return
    error.value = ''
    message.value = ''
    if (!online.value) { error.value = 'You are offline. No session was sent.'; return }
    if (!pending.value && date && !validTrainingDate(date, today.value)) {
      error.value = 'Choose today or a valid past date.'; return
    }
    const current = generation
    const request = pending.value ?? { id: crypto.randomUUID(), trained_on: date ?? today.value }
    try { persistPending(request) }
    catch { error.value = 'Could not store a safe retry ID. Enable site storage before logging.'; return }
    pending.value = request
    busy.value = true
    const activeRepository = repository()
    try {
      await commitSession(activeRepository, request)
      if (current !== generation) return
      persistPending(null)
      pending.value = null
      message.value = 'Session logged.'
      return true
    } catch (failure) {
      if (current === generation) {
        const code = (failure as { code?: string })?.code
        if (code && ['42501', '23514', '23502', '22P02'].includes(code)) {
          persistPending(null)
          pending.value = null
          error.value = 'The database rejected this entry. Check the date or ask the organizer to check permissions.'
        } else error.value = 'Save not confirmed. Retry checks the same entry; it will not log another session.'
      }
    } finally {
      if (current === generation) { busy.value = false; if (!pending.value && !error.value) await refresh() }
    }
  }
  async function remove(id: string) {
    if (busy.value || !online.value || pending.value) return
    const current = generation
    busy.value = true
    error.value = ''
    message.value = ''
    try {
      await repository().remove(id)
      if (current === generation) message.value = 'Session deleted.'
    } catch { if (current === generation) error.value = 'Delete not confirmed. Refresh before trying again.' }
    finally { if (current === generation) { busy.value = false; if (!error.value) await refresh() } }
  }
  async function loadMore() {
    if (loading.value || busy.value || !more.value) return
    const current = generation
    const sequence = ++refreshSequence
    loading.value = true
    try {
      const entries = await repository().history(history.value.length)
      if (current !== generation || sequence !== refreshSequence) return
      history.value.push(...entries)
      more.value = entries.length === 20
    } catch { if (current === generation) error.value = 'Could not load more sessions.' }
    finally { if (current === generation && sequence === refreshSequence) loading.value = false }
  }
  const connection = () => { online.value = navigator.onLine; if (online.value) void refresh() }
  const visibility = () => { if (document.visibilityState === 'visible') void refresh() }
  window.addEventListener('online', connection)
  window.addEventListener('offline', connection)
  document.addEventListener('visibilitychange', visibility)
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && berlinDate() !== summary.value?.today) void refresh() }, 60_000)
  onScopeDispose(() => {
    window.removeEventListener('online', connection)
    window.removeEventListener('offline', connection)
    document.removeEventListener('visibilitychange', visibility)
    window.clearInterval(timer)
  })
  return { summary, history, more, loading, busy, online, message, error, pending, today, refresh, log, remove, loadMore }
}
import { computed, onScopeDispose, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Account state. The display name, last year's session count and the unlock flag live in the account's
 * user metadata, which the signed-in user may edit; nothing here grants permissions.
 */
export function useAuth() {
  const user = ref<User | null>(null)
  const loading = ref(Boolean(supabase))
  const busy = ref(false)
  const error = ref('')
  const preview = ref(false)
  const previewName = ref('Alex')
  const previewLastYear = ref<number | null>(40)
  const previewUnlocked = ref(false)
  // Set when the unlock could not be saved, so the screens still appear on this device.
  const unlockedLocally = ref(false)
  const metadata = computed(() => (user.value?.user_metadata ?? {}) as Record<string, unknown>)
  const displayName = computed(() => preview.value ? previewName.value : String(metadata.value.display_name ?? ''))
  const lastYearCount = computed(() => {
    if (preview.value) return previewLastYear.value
    const stored = metadata.value.last_year_count
    return typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 ? stored : null
  })
  const featuresUnlocked = computed(() => preview.value ? previewUnlocked.value : Boolean(metadata.value.features_unlocked_at) || unlockedLocally.value)
  const identity = computed(() => preview.value ? 'local-preview' : user.value?.id ?? '')

  function applyUser(next: User | null) {
    if (next?.id !== user.value?.id) unlockedLocally.value = false
    user.value = next
  }
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null)
      loading.value = false
    })
    onScopeDispose(() => data.subscription.unsubscribe())
  }
  async function updateMetadata(data: Record<string, unknown>) {
    const { data: result, error: authError } = await supabase!.auth.updateUser({ data })
    if (authError) throw authError
    applyUser(result.user)
  }
  async function signIn(email: string, password: string) {
    if (!supabase || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
      applyUser(data.user)
    } catch {
      error.value = 'Could not sign in. Check your credentials and connection, or contact the organizer.'
    } finally { busy.value = false }
  }
  async function setName(name: string) {
    const trimmed = name.trim().slice(0, 40)
    if (busy.value || !trimmed) return
    if (preview.value) { previewName.value = trimmed; return }
    if (!supabase || !user.value) return
    busy.value = true
    error.value = ''
    try { await updateMetadata({ display_name: trimmed }) }
    catch { error.value = 'Could not save your name. Please try again.' }
    finally { busy.value = false }
  }
  async function setLastYearCount(count: number | null) {
    if (busy.value) return
    if (count !== null && (!Number.isInteger(count) || count < 0)) { error.value = 'Enter a whole number, 0 or more.'; return }
    if (preview.value) { previewLastYear.value = count; return }
    if (!supabase || !user.value) return
    busy.value = true
    error.value = ''
    try { await updateMetadata({ last_year_count: count }) }
    catch { error.value = 'Could not save last year\'s sessions. Please try again.' }
    finally { busy.value = false }
  }
  /** Remember that this account has seen the unlock celebration; failures keep it unlocked on this device only. */
  async function unlockFeatures() {
    if (featuresUnlocked.value) return
    if (preview.value) { previewUnlocked.value = true; return }
    const id = user.value?.id
    if (!supabase || !id) return
    try { await updateMetadata({ features_unlocked_at: new Date().toISOString() }) }
    catch { if (user.value?.id === id) unlockedLocally.value = true }
  }
  function relockPreview() { previewUnlocked.value = false }
  async function signOut() {
    error.value = ''
    if (preview.value) { preview.value = false; return }
    busy.value = true
    try {
      const { error: authError } = await supabase!.auth.signOut({ scope: 'local' })
      if (authError) throw authError
      applyUser(null)
    } catch { error.value = 'Could not sign out. Please try again.' }
    finally { busy.value = false }
  }
  return {
    user, loading, busy, error, preview, displayName, lastYearCount, identity, featuresUnlocked,
    signIn, setName, setLastYearCount, unlockFeatures, relockPreview, signOut,
  }
}

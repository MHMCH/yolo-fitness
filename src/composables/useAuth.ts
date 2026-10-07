import { computed, onScopeDispose, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { loadProfile, saveProfile } from '../lib/profileRepository'
import type { Profile } from '../types/database'

export function useAuth() {
  const user = ref<User | null>(null)
  const profile = ref<Profile | null>(null)
  const loading = ref(Boolean(supabase))
  const profileLoading = ref(false)
  const profileFailed = ref(false)
  const busy = ref(false)
  const error = ref('')
  const preview = ref(false)
  const previewName = ref('Alex')
  const previewLastYear = ref<number | null>(40)
  const previewUnlocked = ref(false)
  // Set when the unlock could not be saved, so the screens still appear on this device.
  const unlockedLocally = ref(false)
  const displayName = computed(() => preview.value ? previewName.value : profile.value?.display_name ?? '')
  const lastYearCount = computed(() => preview.value ? previewLastYear.value : profile.value?.last_year_count ?? null)
  const featuresUnlocked = computed(() => preview.value ? previewUnlocked.value : Boolean(profile.value?.features_unlocked_at) || unlockedLocally.value)
  const isAdmin = computed(() => preview.value || Boolean(profile.value?.is_admin))
  const identity = computed(() => preview.value ? 'local-preview' : user.value?.id ?? '')

  async function fetchProfile(id: string) {
    profileLoading.value = true
    profileFailed.value = false
    try {
      const row = await loadProfile(id)
      if (user.value?.id !== id) return
      profile.value = row
      if (!row) profileFailed.value = true
    } catch {
      if (user.value?.id === id) profileFailed.value = true
    } finally { if (user.value?.id === id) profileLoading.value = false }
  }
  function applyUser(next: User | null) {
    const changed = next?.id !== user.value?.id
    user.value = next
    if (changed) unlockedLocally.value = false
    if (!next) {
      profile.value = null
      profileLoading.value = false
      profileFailed.value = false
    } else if (changed) {
      profile.value = null
      profileLoading.value = true
      // Supabase may hold its auth lock while this callback runs; defer the request.
      setTimeout(() => { void fetchProfile(next.id) }, 0)
    }
  }
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null)
      loading.value = false
    })
    onScopeDispose(() => data.subscription.unsubscribe())
  }
  function retryProfile() {
    if (user.value) void fetchProfile(user.value.id)
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
    if (!user.value) return
    busy.value = true
    error.value = ''
    try {
      profile.value = await saveProfile(user.value.id, { display_name: trimmed })
    } catch (failure) {
      error.value = (failure as { code?: string })?.code === '23505'
        ? 'That name is already taken. Please choose another.'
        : 'Could not save your name. Please try again.'
    } finally { busy.value = false }
  }
  async function setLastYearCount(count: number | null) {
    if (busy.value) return
    if (count !== null && (!Number.isInteger(count) || count < 0)) { error.value = 'Enter a whole number, 0 or more.'; return }
    if (preview.value) { previewLastYear.value = count; return }
    if (!user.value) return
    busy.value = true
    error.value = ''
    try {
      profile.value = await saveProfile(user.value.id, { last_year_count: count })
    } catch { error.value = 'Could not save last year\'s sessions. Please try again.' }
    finally { busy.value = false }
  }
  /** Remember that this account has seen the unlock celebration; failures keep it unlocked on this device only. */
  async function unlockFeatures() {
    if (featuresUnlocked.value) return
    if (preview.value) { previewUnlocked.value = true; return }
    const id = user.value?.id
    if (!id) return
    try {
      const saved = await saveProfile(id, { features_unlocked_at: new Date().toISOString() })
      if (user.value?.id === id) profile.value = saved
    } catch { if (user.value?.id === id) unlockedLocally.value = true }
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
    user, profile, loading, profileLoading, profileFailed, busy, error, preview, displayName, lastYearCount, isAdmin, identity, featuresUnlocked,
    signIn, setName, setLastYearCount, retryProfile, unlockFeatures, relockPreview, signOut,
  }
}

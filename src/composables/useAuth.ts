import { computed, onScopeDispose, ref } from 'vue'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const user = ref<User | null>(null)
  const loading = ref(Boolean(supabase))
  const busy = ref(false)
  const error = ref('')
  const preview = ref(false)
  const displayName = computed(() => preview.value ? 'Alex' : String(user.value?.user_metadata.display_name ?? ''))
  const identity = computed(() => preview.value ? 'local-preview' : user.value?.id ?? '')
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user ?? null
      loading.value = false
    })
    onScopeDispose(() => data.subscription.unsubscribe())
  }
  async function signIn(email: string, password: string) {
    if (!supabase || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
      user.value = data.user
    } catch {
      error.value = 'Could not sign in. Check your credentials and connection, or contact the organizer.'
    } finally { busy.value = false }
  }
  async function setName(name: string) {
    if (!supabase || busy.value || !name.trim()) return
    busy.value = true
    error.value = ''
    try {
      const { data, error: authError } = await supabase.auth.updateUser({ data: { display_name: name.trim().slice(0, 40) } })
      if (authError) throw authError
      user.value = data.user
    } catch { error.value = 'Could not save your name. Please try again.' }
    finally { busy.value = false }
  }
  async function signOut() {
    error.value = ''
    if (preview.value) { preview.value = false; return }
    busy.value = true
    try {
      const { error: authError } = await supabase!.auth.signOut({ scope: 'local' })
      if (authError) throw authError
      user.value = null
    } catch { error.value = 'Could not sign out. Please try again.' }
    finally { busy.value = false }
  }
  return { user, loading, busy, error, preview, displayName, identity, signIn, setName, signOut }
}
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, History, UserRound, ArrowLeft, ArrowRight, LogOut, Trash2, CalendarPlus, RefreshCw, Check, WifiOff, LoaderCircle, X } from '@lucide/vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useAuth } from './composables/useAuth'
import { useTrainingSessions } from './composables/useTrainingSessions'
import { useSessionSound } from './composables/useSessionSound'
import { configured } from './lib/supabase'
import { sessionRepository, type SessionRepository } from './lib/sessionRepository'
import { displayDate, displayMonth } from './lib/trainingDates'

const { user, loading: authLoading, busy: authBusy, error: authError, preview, displayName, identity, signIn, setName, signOut } = useAuth()
let demoRepository: SessionRepository | null = null
const training = useTrainingSessions(identity, () => preview.value ? demoRepository! : sessionRepository)
const { summary, history, more, loading, busy, online, message, error, pending, today } = training
const view = ref<'home' | 'history' | 'account'>('home')
const email = ref('')
const password = ref('')
const name = ref('')
const pastDate = ref('')
const adding = ref(false)
const canPreview = import.meta.env.DEV
const iconUrl = `${import.meta.env.BASE_URL}favicon.png`
const locked = computed(() => busy.value || loading.value || !online.value || !summary.value)
const { needRefresh, updateServiceWorker } = useRegisterSW()
const { enabled: soundEnabled, prepare: prepareSound, play: playSound, setEnabled: setSoundEnabled } = useSessionSound()
watch(identity, () => { view.value = 'home'; name.value = ''; pastDate.value = ''; adding.value = false })
watch(displayName, (value) => { name.value = value }, { immediate: true })
async function submitSignIn() {
  const secret = password.value
  password.value = ''
  await signIn(email.value, secret)
}
async function startPreview() {
  if (!import.meta.env.DEV) return
  const { createDemoRepository } = await import('./lib/demoRepository')
  demoRepository = createDemoRepository()
  preview.value = true
}
async function addPast() {
  if (!pastDate.value) return
  await logSession(pastDate.value)
  if (!pending.value && !error.value) { adding.value = false; pastDate.value = '' }
}
async function logSession(date?: string) {
  if (locked.value) return
  const account = identity.value
  prepareSound()
  const saved = await training.log(date)
  if (saved && identity.value === account) void playSound()
}
async function deleteEntry(id: string, date: string) {
  if (window.confirm(`Permanently delete the session on ${displayDate(date)}?`)) await training.remove(id)
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" @click.prevent="view = 'home'">
        <img :src="iconUrl" width="30" height="30" alt="" />
        <span>yolo-fitness</span>
      </a>
      <span v-if="preview" class="preview-label">Local preview</span>
      <div v-else-if="identity" class="connection" :class="{ disconnected: !online }">
        <span v-if="online" class="connection-dot"></span><WifiOff v-else :size="14" />
        {{ online ? 'Connected' : 'Offline' }}
      </div>
    </header>

    <main v-if="authLoading" class="auth-view"><LoaderCircle class="spin" aria-label="Restoring session" /></main>
    <main v-else-if="!identity" class="auth-view">
      <template v-if="configured">
        <p class="eyebrow">YOUR TRAINING LOG</p>
        <h1>Welcome back.</h1>
        <form class="auth-form" @submit.prevent="submitSignIn">
          <label for="email">Email address</label>
          <input id="email" v-model="email" type="email" autocomplete="username" required :disabled="authBusy" />
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" autocomplete="current-password" required :disabled="authBusy" />
          <button class="primary" type="submit" :disabled="authBusy"><LoaderCircle v-if="authBusy" class="spin" :size="18" /><ArrowRight v-else :size="18" /> Sign in</button>
        </form>
        <p class="muted small recovery">Lost your password? Contact the organizer.</p>
        <p v-if="authError" class="feedback error" role="alert">{{ authError }}</p>
      </template>
      <template v-else>
        <p class="eyebrow">YOLO-FITNESS</p><h1>Setup required.</h1>
        <p class="muted">The Supabase connection has not been configured.</p>
        <button v-if="canPreview" class="primary" @click="startPreview"><ArrowRight :size="18" /> Local preview</button>
      </template>
    </main>

    <main v-else-if="!displayName" class="auth-view">
      <p class="eyebrow">ONE LAST THING</p><h1>What should we call you?</h1>
      <form class="auth-form" @submit.prevent="setName(name)">
        <label for="name">Your name</label><input id="name" v-model="name" autocomplete="given-name" maxlength="40" required />
        <button class="primary" :disabled="authBusy || !name.trim()"><ArrowRight :size="18" /> Save name</button>
      </form>
      <p v-if="authError" role="alert" class="feedback error">{{ authError }}</p>
    </main>

    <main v-else class="workspace">
      <template v-if="view === 'home'">
        <div class="greeting"><p class="eyebrow">{{ displayMonth(today).toUpperCase() }} / {{ today.slice(0, 4) }}</p><h1>Hey, {{ displayName }}.</h1></div>
        <section class="training-action" aria-label="Log training">
          <button class="log-button" :disabled="locked" :aria-label="pending ? 'Retry unconfirmed session' : 'Log a training session'" :title="pending ? 'Retry unconfirmed session' : 'Log a training session'" @click="logSession()">
            <LoaderCircle v-if="busy" class="spin" :size="66" :stroke-width="2" />
            <RefreshCw v-else-if="pending" :size="66" :stroke-width="2" />
            <Plus v-else :size="96" :stroke-width="2.7" />
          </button>
          <span class="action-date">{{ displayDate(today) }}</span>
        </section>
        <section class="counters" aria-label="Training totals">
          <div class="counter"><span class="counter-value">{{ summary?.month_count ?? '--' }}</span><span class="counter-label">Sessions this month</span></div>
          <div class="counter"><span class="counter-value">{{ summary?.total_count ?? '--' }}</span><span class="counter-label">Total sessions</span></div>
        </section>
      </template>

      <template v-else-if="view === 'history'">
        <div class="view-heading"><div><p class="eyebrow">YOUR RECORD</p><h1>Sessions.</h1></div><button class="icon-button" title="Add a past session" aria-label="Add a past session" :disabled="locked || !!pending" @click="adding = !adding"><CalendarPlus :size="22" /></button></div>
        <form v-if="adding" class="date-form" @submit.prevent="addPast">
          <label for="trained-on">Training date</label>
          <div class="date-row"><input id="trained-on" v-model="pastDate" type="date" min="0001-01-01" :max="today" required :disabled="busy" /><button class="primary" :disabled="locked || !!pending"><Plus :size="18" /> Add</button><button type="button" class="icon-button" aria-label="Cancel" title="Cancel" @click="adding = false"><X :size="20" /></button></div>
        </form>
        <ul class="session-list">
          <li v-for="entry in history" :key="entry.id"><div class="session-mark"><Check :size="18" /></div><div class="session-detail"><span>{{ displayDate(entry.trained_on) }}</span><span class="muted small">Training session</span></div><button class="icon-button delete-button" title="Delete session" :aria-label="`Delete session on ${displayDate(entry.trained_on)}`" :disabled="busy || !online || !!pending" @click="deleteEntry(entry.id, entry.trained_on)"><Trash2 :size="18" /></button></li>
        </ul>
        <p v-if="!history.length && !loading && !error" class="empty muted">No sessions yet.</p>
        <button v-if="more" class="secondary load-more" :disabled="loading || busy" @click="training.loadMore()">Load more <ArrowRight :size="16" /></button>
      </template>

      <template v-else>
        <p class="eyebrow">YOUR ACCOUNT</p><h1>Hey, {{ displayName }}.</h1>
        <form v-if="!preview" class="auth-form account-form" @submit.prevent="setName(name)">
          <label for="account-name">Display name</label><input id="account-name" v-model="name" maxlength="40" required />
          <button class="secondary" :disabled="authBusy || !name.trim() || name.trim() === displayName"><Check :size="18" /> Save name</button>
        </form>
        <p v-if="user" class="muted account-email">{{ user.email }}</p>
        <label class="sound-setting"><span>Session sound</span><input type="checkbox" :checked="soundEnabled" @change="setSoundEnabled(($event.target as HTMLInputElement).checked)" /></label>
        <p v-if="authError" class="feedback error" role="alert">{{ authError }}</p>
        <button class="secondary signout" :disabled="authBusy || busy || !!pending" @click="signOut"><LogOut :size="18" /> {{ preview ? 'Exit preview' : 'Sign out' }}</button>
      </template>

      <div class="status-area" aria-live="polite">
        <p v-if="!online" class="feedback muted"><WifiOff :size="16" /> Offline. Logging needs a connection.</p>
        <p v-if="message" class="feedback success"><Check :size="16" /> {{ message }}</p>
        <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
        <button v-if="pending" class="secondary" :disabled="locked" @click="logSession()"><RefreshCw :size="16" /> Retry unconfirmed save</button>
        <button v-else-if="error" class="secondary" :disabled="loading || busy || !online" @click="training.refresh()"><RefreshCw :size="16" /> Refresh</button>
      </div>
      <nav class="bottom-nav" aria-label="Main navigation">
        <button v-if="view !== 'home'" class="nav-button" @click="view = 'home'"><ArrowLeft :size="18" /> Back</button><span v-else class="nav-identity">{{ displayName }}</span>
        <div class="nav-actions"><button class="icon-button" :class="{ selected: view === 'history' }" title="Session history" aria-label="Session history" :aria-current="view === 'history' ? 'page' : undefined" @click="view = 'history'"><History :size="21" /></button><button class="icon-button" :class="{ selected: view === 'account' }" title="Account" aria-label="Account" :aria-current="view === 'account' ? 'page' : undefined" @click="view = 'account'"><UserRound :size="21" /></button></div>
      </nav>
    </main>
    <aside v-if="needRefresh" class="update-bar"><span>Update available.</span><button class="secondary" :disabled="busy || !!pending || authBusy" @click="updateServiceWorker(true)"><RefreshCw :size="16" /> Update</button><button class="icon-button" title="Dismiss update" aria-label="Dismiss update" @click="needRefresh = false"><X :size="18" /></button></aside>
    <footer class="footer"><span>yolo-fitness</span><span>Europe/Berlin</span></footer>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Plus, History, Trophy, House, Users, UserRound, ArrowLeft, ArrowRight, LogOut, Trash2, CalendarPlus, RefreshCw, Check, WifiOff, LoaderCircle, X } from '@lucide/vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useAuth } from './composables/useAuth'
import { useTrainingSessions } from './composables/useTrainingSessions'
import { useSessionSound } from './composables/useSessionSound'
import { useSeasonProgress } from './composables/useSeasonProgress'
import { useBoards } from './composables/useBoards'
import SeasonProgress from './components/SeasonProgress.vue'
import StatusToast from './components/StatusToast.vue'
import LeaderboardView from './components/LeaderboardView.vue'
import LeagueView from './components/LeagueView.vue'
import CelebrationOverlay from './components/CelebrationOverlay.vue'
import { configured } from './lib/supabase'
import { sessionRepository, type SessionRepository } from './lib/sessionRepository'
import { seasonRepository, type SeasonRepository } from './lib/seasonRepository'
import { boardRepository, type BoardRepository } from './lib/boardRepository'
import { appConfig, type AppConfig } from './config'
import { streetGreetings } from './config/release'
import { confirmation, greeting } from './lib/greetings'
import { neighbour, NO_SWIPE_SELECTOR, swipeDirection, type Point } from './lib/swipe'
import { displayDate, displayMonth, monthBounds } from './lib/trainingDates'

const { user, loading: authLoading, busy: authBusy, error: authError, preview, displayName, lastYearCount, identity, featuresUnlocked, signIn, setName, setLastYearCount, unlockFeatures, relockPreview, signOut } = useAuth()
let demo: { sessions: SessionRepository; season: SeasonRepository; boards: BoardRepository; config: AppConfig } | null = null
const config = () => preview.value ? demo!.config : appConfig
const training = useTrainingSessions(identity, () => preview.value ? demo!.sessions : sessionRepository)
const { summary, history, more, loading, busy, online, message, error, pending, today } = training
const progress = useSeasonProgress(identity, computed(() => summary.value?.total_count), () => config().seasonStart, () => preview.value ? demo!.season : seasonRepository)
const lastYearInput = ref('')
// The season screens stay hidden until the first confirmed session; the celebration ends before they appear.
const celebrating = ref(false)
const featuresVisible = computed(() => featuresUnlocked.value && !celebrating.value)
// The plus turns into a check mark for a moment after a confirmed save, because the toast alone could be missed.
const justLogged = ref(false)
let justLoggedTimer = 0
// Street greetings: a gimmick that can be switched off with `streetGreetings`. The clock ticks once a minute so the line follows the time of day.
const clock = ref(new Date())
const clockTimer = window.setInterval(() => { clock.value = new Date() }, 60_000)
onBeforeUnmount(() => window.clearInterval(clockTimer))
const street = computed(() => streetGreetings && featuresVisible.value ? greeting(clock.value, displayName.value) : null)
const openFrom = computed(() => monthBounds(today.value).start)
const view = ref<'home' | 'history' | 'leaderboard' | 'league' | 'account'>('home')
const boards = useBoards(identity, computed(() => view.value === 'leaderboard' || view.value === 'league'), computed(() => summary.value?.total_count),
  config, () => today.value, () => preview.value ? demo!.boards : boardRepository)
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
watch(identity, () => { celebrating.value = false; view.value = 'home'; name.value = ''; pastDate.value = ''; adding.value = false })
watch(displayName, (value) => { name.value = value }, { immediate: true })
// A confirmation belongs to the moment it happened: drop it when leaving the screen and after a few seconds.
let messageTimer = 0
watch(view, () => { message.value = '' })
// A copy that failed, shown as an error toast without actions; it goes away on its own.
const notice = ref('')
let noticeTimer = 0
watch(notice, (text) => { window.clearTimeout(noticeTimer); if (text) noticeTimer = window.setTimeout(() => { notice.value = '' }, 5000) })

// Swiping sideways moves between the tabs. The charts, form fields and the tab bar keep their own touch behaviour.
const workspace = ref<HTMLElement | null>(null)
const tabOrder = computed<Array<'home' | 'leaderboard' | 'league' | 'account'>>(() => featuresVisible.value ? ['home', 'leaderboard', 'league', 'account'] : ['home', 'account'])
const currentTab = computed(() => view.value === 'history' ? 'home' : view.value)
let swipeStart: Point | null = null
function swipeBegin(event: TouchEvent) {
  const touch = event.touches[0]
  const blocked = event.touches.length !== 1 || celebrating.value || (event.target instanceof Element && event.target.closest(NO_SWIPE_SELECTOR))
  swipeStart = blocked || !touch ? null : { x: touch.clientX, y: touch.clientY }
}
function swipeEnd(event: TouchEvent) {
  const start = swipeStart
  swipeStart = null
  const touch = event.changedTouches[0]
  if (!start || !touch) return
  const direction = swipeDirection(start, { x: touch.clientX, y: touch.clientY }, window.innerWidth)
  const target = direction ? neighbour(tabOrder.value, currentTab.value as (typeof tabOrder.value)[number], direction) : null
  if (target) view.value = target
}
// A short slide-in of the new screen. Only the content moves: the fixed tab bar must not be inside a transformed parent.
const tabOf = (name: string) => tabOrder.value.indexOf(name as (typeof tabOrder.value)[number])
watch(view, async (next, previous) => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const from = tabOf(previous === 'history' ? 'home' : previous)
  const to = tabOf(next === 'history' ? 'home' : next)
  if (from < 0 || to < 0 || from === to) return
  await nextTick()
  const offset = to > from ? 28 : -28
  for (const element of Array.from(workspace.value?.children ?? [])) {
    if (element.matches('.tabs, .toast-region')) continue
    element.animate([{ transform: `translateX(${offset}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'ease-out' })
  }
})
watch(message, (text) => { window.clearTimeout(messageTimer); if (text) messageTimer = window.setTimeout(() => { message.value = '' }, 4000) })
watch(lastYearCount, (value) => { lastYearInput.value = value === null ? '' : String(value) }, { immediate: true })
async function submitSignIn() {
  const secret = password.value
  password.value = ''
  await signIn(email.value, secret)
}
async function startPreview() {
  if (!import.meta.env.DEV) return
  const { createDemo } = await import('./lib/demoRepository')
  demo = createDemo()
  preview.value = true
}
// The save buttons stay disabled until the field differs from what is stored.
const lastYearChanged = computed(() => String(lastYearInput.value ?? '').trim() !== (lastYearCount.value === null ? '' : String(lastYearCount.value)))
async function saveLastYear() {
  if (await setLastYearCount(lastYearInput.value)) message.value = lastYearCount.value === null ? 'Last year\'s sessions cleared.' : 'Last year\'s sessions saved.'
}
async function saveName() {
  if (await setName(name.value)) message.value = 'Name saved.'
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
  if (saved && identity.value === account) {
    void playSound()
    justLogged.value = true
    window.clearTimeout(justLoggedTimer)
    justLoggedTimer = window.setTimeout(() => { justLogged.value = false }, 1400)
    if (!featuresUnlocked.value) { celebrating.value = true; void unlockFeatures() }
    else if (streetGreetings && featuresVisible.value) message.value = confirmation(new Date())
  }
}
async function deleteEntry(id: string, date: string) {
  if (window.confirm(`Permanently delete the session on ${displayDate(date)}?`)) await training.remove(id)
}
</script>

<template>
  <div class="app-shell" :class="{ 'with-nav': identity && displayName }">
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

    <main v-else ref="workspace" class="workspace" @touchstart.passive="swipeBegin" @touchend.passive="swipeEnd">
      <template v-if="view === 'home'">
        <div v-if="street" class="greeting"><p class="eyebrow">{{ street.eyebrow }}</p><h1>{{ street.title }}</h1></div>
        <div v-else class="greeting"><p class="eyebrow">{{ displayMonth(today).toUpperCase() }} / {{ today.slice(0, 4) }}</p><h1>Hey, {{ displayName }}.</h1></div>
        <section class="training-action" aria-label="Log training">
          <button class="log-button" :disabled="locked" :aria-label="pending ? 'Retry unconfirmed session' : 'Log a training session'" :title="pending ? 'Retry unconfirmed session' : 'Log a training session'" @click="logSession()">
            <LoaderCircle v-if="busy" class="spin" :size="66" :stroke-width="2" />
            <RefreshCw v-else-if="pending" :size="66" :stroke-width="2" />
            <Check v-else-if="justLogged" class="logged-check" :size="96" :stroke-width="2.7" />
            <Plus v-else :size="96" :stroke-width="2.7" />
          </button>
          <span class="action-date">{{ displayDate(today) }}</span>
        </section>
        <section class="counters" aria-label="Training totals">
          <div class="counter"><span class="counter-value">{{ summary?.month_count ?? '--' }}</span><span class="counter-label">Sessions this month</span></div>
          <div class="counter"><span class="counter-value">{{ summary?.total_count ?? '--' }}</span><span class="counter-label">Total sessions</span></div>
        </section>
        <SeasonProgress v-if="featuresVisible" :season="progress.season.value" :days="progress.days.value" :today="today" :last-year="lastYearCount" />
        <p v-else-if="featuresVisible && progress.error.value" class="feedback muted">{{ progress.error.value }}</p>
        <button class="secondary history-link" @click="view = 'history'"><History :size="18" /> Session history</button>
      </template>

      <template v-else-if="view === 'history'">
        <div class="view-heading"><button class="icon-button" title="Back" aria-label="Back" @click="view = 'home'"><ArrowLeft :size="22" /></button><div class="heading-text"><p class="eyebrow">YOUR RECORD</p><h1>Sessions.</h1></div><button class="icon-button" title="Add a past session" aria-label="Add a past session" :disabled="locked || !!pending" @click="adding = !adding"><CalendarPlus :size="22" /></button></div>
        <form v-if="adding" class="date-form" @submit.prevent="addPast">
          <label for="trained-on">Training date</label>
          <div class="date-row"><input id="trained-on" v-model="pastDate" type="date" :min="openFrom" :max="today" required :disabled="busy" /><button class="primary" :disabled="locked || !!pending"><Plus :size="18" /> Add</button><button type="button" class="icon-button" aria-label="Cancel" title="Cancel" @click="adding = false"><X :size="20" /></button></div>
        </form>
        <ul class="session-list">
          <li v-for="entry in history" :key="entry.id"><div class="session-mark"><Check :size="18" /></div><div class="session-detail"><span>{{ displayDate(entry.trained_on) }}</span><span class="muted small">Training session</span></div><button class="icon-button delete-button" title="Delete session" :aria-label="`Delete session on ${displayDate(entry.trained_on)}`" :disabled="busy || !online || !!pending || entry.trained_on < openFrom" @click="deleteEntry(entry.id, entry.trained_on)"><Trash2 :size="18" /></button></li>
        </ul>
        <p v-if="!history.length && !loading && !error" class="empty muted">No sessions yet.</p>
        <button v-if="more" class="secondary load-more" :disabled="loading || busy" @click="training.loadMore()">Load more <ArrowRight :size="16" /></button>
      </template>

      <template v-else-if="view === 'leaderboard'">
        <LeaderboardView @notify="message = $event" @fail="notice = $event" :season="progress.season.value" :rows="boards.leaderboard.value" :daily="boards.daily.value" :today="today" :me="identity"
          :loaded="boards.loaded.value" :loading="boards.loading.value" :error="boards.error.value" @refresh="boards.refresh()" />
      </template>

      <template v-else-if="view === 'league'">
        <LeagueView @notify="message = $event" @fail="notice = $event" :league="config().league" :monthly="boards.monthly.value" :daily="boards.daily.value" :today="today" :me="identity"
          :loaded="boards.loaded.value" :loading="boards.loading.value" :error="boards.error.value" :team-name="boards.teamName" @refresh="boards.refresh()" />
      </template>

      <template v-else>
        <p class="eyebrow">YOUR ACCOUNT</p><h1>Hey, {{ displayName }}.</h1>
        <form v-if="!preview" class="auth-form account-form" @submit.prevent="saveName">
          <label for="account-name">Display name</label><input id="account-name" v-model="name" maxlength="40" required />
          <button class="secondary" :disabled="authBusy || !name.trim() || name.trim() === displayName"><Check :size="18" /> Save name</button>
        </form>
        <form v-if="featuresVisible" class="auth-form account-form" @submit.prevent="saveLastYear">
          <label for="last-year">Last year's sessions</label>
          <input id="last-year" v-model="lastYearInput" type="number" inputmode="numeric" min="0" max="10000" step="1" placeholder="Optional" />
          <button class="secondary" :disabled="authBusy || !lastYearChanged"><Check :size="18" /> Save last year</button>
        </form>
        <p v-if="user" class="muted account-email">{{ user.email }}</p>
        <label class="sound-setting"><span>Session sound</span><input type="checkbox" :checked="soundEnabled" @change="setSoundEnabled(($event.target as HTMLInputElement).checked)" /></label>
        <p v-if="authError" class="feedback error" role="alert">{{ authError }}</p>
        <button v-if="preview" class="secondary admin-link" @click="relockPreview"><RefreshCw :size="18" /> Replay unlock (preview)</button>
        <button class="secondary signout" :disabled="authBusy || busy || !!pending" @click="signOut"><LogOut :size="18" /> {{ preview ? 'Exit preview' : 'Sign out' }}</button>
      </template>

      <div class="status-area" aria-live="polite">
        <p v-if="!online" class="feedback muted"><WifiOff :size="16" /> Offline. Logging needs a connection.</p>
      </div>
      <nav class="bottom-nav tabs" aria-label="Main navigation">
        <button class="tab" :class="{ selected: view === 'home' || view === 'history' }" :aria-current="view === 'home' || view === 'history' ? 'page' : undefined" @click="view = 'home'"><House :size="21" /><span>Home</span></button>
        <button v-if="featuresVisible" class="tab" :class="{ selected: view === 'leaderboard' }" :aria-current="view === 'leaderboard' ? 'page' : undefined" @click="view = 'leaderboard'"><Trophy :size="21" /><span>Leaderboard</span></button>
        <button v-if="featuresVisible" class="tab" :class="{ selected: view === 'league' }" :aria-current="view === 'league' ? 'page' : undefined" @click="view = 'league'"><Users :size="21" /><span>League</span></button>
        <button class="tab" :class="{ selected: view === 'account' }" :aria-current="view === 'account' ? 'page' : undefined" @click="view = 'account'"><UserRound :size="21" /><span>Account</span></button>
      </nav>
    </main>
    <aside v-if="needRefresh" class="update-bar"><span>Update available.</span><button class="secondary" :disabled="busy || !!pending || authBusy" @click="updateServiceWorker(true)"><RefreshCw :size="16" /> Update</button><button class="icon-button" title="Dismiss update" aria-label="Dismiss update" @click="needRefresh = false"><X :size="18" /></button></aside>
    <StatusToast v-if="identity" :message="message" :error="error" :notice="notice" :pending="!!pending" :busy="locked" @retry="logSession()" @refresh="training.refresh()" @dismiss="error = ''" />
    <CelebrationOverlay v-if="celebrating" @close="celebrating = false" />
    <footer class="footer"><span>yolo-fitness</span><span>Europe/Berlin</span></footer>
  </div>
</template>
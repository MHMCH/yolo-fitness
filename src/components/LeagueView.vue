<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Copy, LoaderCircle, Medal, RefreshCw, Trophy } from '@lucide/vue'
import LineChart from './LineChart.vue'
import { useClipboard } from '../composables/useClipboard'
import type { AppConfig } from '../config'
import { leagueText, quarterLabel, quarterTable, quarterWinners, type LeagueRow } from '../lib/league'
import { addDays } from '../lib/seasonChart'
import { buildTeamSeries, dayTicks, defaultSelection, formatScore, monthLabel, monthRange, monthRows, ordinal, quarterKeys, teamColor, totalRows } from '../lib/teams'
import { daysUntilMonthEnd, displayDate } from '../lib/trainingDates'
import type { DailyPoints, MonthlyPoints } from '../types/database'

const props = defineProps<{
  league: AppConfig['league']; monthly: MonthlyPoints[]; daily: DailyPoints[]; today: string; me: string
  loaded: boolean; loading: boolean; error: string; teamName: (team: string[]) => string
}>()
defineEmits<{ refresh: [] }>()

const keys = computed(() => quarterKeys(props.league))
const key = ref('')
const month = ref<number | 'total'>(0)
watch(keys, (list) => {
  if (!list.includes(key.value)) { const selection = defaultSelection(list, props.today); key.value = selection.key; month.value = selection.month }
}, { immediate: true })
const teams = computed(() => props.league[key.value] ?? [])
const { copying, message: copyMessage, error: copyError, copy } = useClipboard(computed(() => JSON.stringify([props.me, key.value, month.value])))

const range = computed(() => typeof month.value === 'number' && key.value ? monthRange(key.value, month.value) : null)
const rows = computed(() => range.value ? monthRows(teams.value, props.monthly, range.value, props.today) : [])
const totals = computed(() => key.value ? totalRows(teams.value, props.monthly, key.value, props.today) : [])
const table = computed(() => key.value ? quarterTable(teams.value, props.monthly, key.value, props.today) : [])
const medalsOf = (team: string[]) => table.value.find((row) => row.team === team)?.medals ?? []
const winners = computed(() => quarterWinners(props.league, Object.fromEntries(keys.value.map((entry) => [entry, props.monthly])), props.today))
const mine = (team: string[]) => team.includes(props.me)
const started = computed(() => rows.value.some((row) => row.started))
const closed = computed(() => rows.value.length > 0 && rows.value.every((row) => row.closed))
const series = computed(() => range.value ? buildTeamSeries(rows.value, props.daily, range.value, props.today, props.me, props.teamName) : [])
const ticks = computed(() => range.value ? dayTicks(range.value.lo, range.value.length) : [])
const dateLabel = (index: number) => displayDate(addDays(range.value!.lo, index))
const myRow = computed(() => rows.value.find((row) => mine(row.team)))
const myTotal = computed(() => totals.value.find((row) => mine(row.team)))
const status = computed(() => {
  if (!range.value) return ''
  if (!started.value) return `Starts ${displayDate(range.value.lo)}`
  return closed.value ? 'Closed · final result with bonus' : `Live · closes ${displayDate(addDays(range.value.hi, -1))}, 23:59`
})
const places = ['', 'First place', 'Second place', 'Third place']
const medalClass = (rank: number) => ['', 'gold', 'silver', 'bronze'][rank]
const bonusCountdown = computed(() => {
  const days = daysUntilMonthEnd(props.today)
  return days === 1 ? 'tonight at 23:59' : days === 2 ? 'tomorrow at 23:59' : `in ${days - 1} days`
})
const summary = computed(() => rows.value.map((row) => `${row.rank}. ${props.teamName(row.team)}, ${formatScore(row.average)}`).join('; '))
const totalMax = computed(() => Math.max(1, ...totals.value.map((row) => row.total)))
const segments = (row: (typeof totals.value)[number]) => row.months.map((value, index) => ({ index, value: value ?? 0, live: row.liveMonth === index }))
  .filter((segment) => segment.value > 0)
const hasTeams = computed(() => keys.value.length > 0)
const canCopy = computed(() => props.loaded && !props.loading && !props.error && !copying.value && rows.value.length + totals.value.length > 0)
function copyLeague() {
  const asLeagueRows: LeagueRow[] = rows.value.map((row) => ({
    team: row.team, monthAverage: row.average, monthRank: row.rank, monthBonus: row.bonus,
    quarterTotal: totals.value.find((total) => total.slot === row.slot)?.total ?? 0, medals: medalsOf(row.team),
  }))
  void copy(leagueText(asLeagueRows, props.teamName), 'League')
}
</script>

<template>
  <div class="view-heading board-heading">
    <div><p class="eyebrow">{{ key ? quarterLabel(key).toUpperCase() : 'SEASON' }}</p><h1>League.</h1></div>
    <div class="board-actions">
      <button v-if="month !== 'total'" class="icon-button" title="Copy league" aria-label="Copy league" :disabled="!canCopy" @click="copyLeague">
        <LoaderCircle v-if="copying" class="spin" :size="20" /><Copy v-else :size="20" />
      </button>
      <button class="icon-button" title="Refresh" aria-label="Refresh" :disabled="loading" @click="$emit('refresh')"><RefreshCw :size="20" :class="{ spin: loading }" /></button>
    </div>
  </div>
  <p v-if="!hasTeams" class="empty muted">No teams are set up yet.</p>
  <template v-else>
    <div class="pill-row" role="tablist" aria-label="Quarter">
      <button v-for="entry in keys" :key="entry" class="pill" role="tab" :class="{ selected: key === entry }" :aria-selected="key === entry" @click="key = entry">
        <strong>{{ quarterLabel(entry).split(' ')[0] }}</strong><span>{{ quarterLabel(entry).split(' ')[1] }}</span>
      </button>
    </div>
    <div class="pill-row months" role="tablist" aria-label="Month">
      <button v-for="index in 3" :key="index" class="pill" role="tab" :class="{ selected: month === index - 1 }" :aria-selected="month === index - 1" @click="month = index - 1">{{ monthLabel(key, index - 1) }}</button>
      <button class="pill" role="tab" :class="{ selected: month === 'total' }" :aria-selected="month === 'total'" @click="month = 'total'">Total</button>
    </div>

    <section v-if="winners.length" class="champions" aria-label="Quarter champions">
      <p class="eyebrow">QUARTER CHAMPIONS</p>
      <ul><li v-for="winner in winners" :key="winner.key"><Trophy :size="16" class="gold" /><span class="muted">{{ quarterLabel(winner.key) }}</span><span>{{ winner.teams.map(teamName).join(' / ') }}</span></li></ul>
    </section>

    <p v-if="loading && !loaded" class="empty muted"><LoaderCircle class="spin" :size="20" aria-label="Loading league" /></p>
    <template v-else-if="loaded && month !== 'total'">
      <p class="team-status muted small">{{ status }}</p>
      <div v-if="myRow && started" class="your-team">
        <span class="eyebrow">YOUR TEAM</span>
        <span><strong>{{ ordinal(myRow.rank) }}</strong> · {{ teamName(myRow.team) }} · {{ closed ? formatScore(myRow.average + myRow.bonus) : `Ø ${formatScore(myRow.average)}` }}</span>
      </div>
      <div v-if="started" class="ranking-chart">
        <LineChart :days="range!.length" :series="series" :ticks="ticks" :date-label="dateLabel" :summary="summary" :min-scale="2" zoom :min-days="7" />
      </div>
      <ol class="team-list">
        <li v-for="row in rows" :key="row.slot" :class="{ me: mine(row.team) }">
          <span class="rank-place">
            <template v-if="started"><Medal v-if="row.rank <= 3 && row.average > 0" :size="18" :class="medalClass(row.rank)" role="img" :aria-label="places[row.rank]" /><template v-else>{{ row.rank }}</template></template>
          </span>
          <span class="team-chip" :style="{ background: teamColor(row.slot) }"></span>
          <span class="team-names">{{ teamName(row.team) }}
            <span class="medals"><Medal v-for="(rank, index) in medalsOf(row.team)" :key="index" :size="14" :class="medalClass(rank)" role="img" :aria-label="`${places[rank]} in a closed month`" /></span>
          </span>
          <span v-if="started" class="team-score">
            <strong>{{ row.closed ? formatScore(row.average + row.bonus) : formatScore(row.average) }}
              <span v-if="!row.closed && row.bonus" class="bonus-chip" :class="medalClass(row.rank)" :title="`Currently ${places[row.rank].toLowerCase()}: +${row.bonus} at month end`">+{{ row.bonus }}</span></strong>
            <span class="muted small">{{ row.closed ? `${formatScore(row.average)} + ${row.bonus}` : 'Ø per head' }}</span>
          </span>
        </li>
      </ol>
      <p v-if="started && !closed" class="bonus-legend muted"><span class="gold">1st +3</span> · <span class="silver">2nd +2</span> · <span class="bronze">3rd +1</span> · awarded {{ bonusCountdown }}</p>
    </template>

    <template v-else-if="loaded">
      <p class="team-status muted small">Quarter total · closed months with bonus, running month without</p>
      <div v-if="myTotal" class="your-team">
        <span class="eyebrow">YOUR TEAM</span>
        <span><strong>{{ ordinal(myTotal.rank) }}</strong> · {{ teamName(myTotal.team) }} · {{ formatScore(myTotal.total) }}</span>
      </div>
      <ol class="team-list">
        <li v-for="row in totals" :key="row.slot" :class="{ me: mine(row.team) }" class="total-row">
          <span class="rank-place"><Medal v-if="row.rank <= 3 && row.total > 0" :size="18" :class="medalClass(row.rank)" role="img" :aria-label="places[row.rank]" /><template v-else>{{ row.rank }}</template></span>
          <span class="team-chip" :style="{ background: teamColor(row.slot) }"></span>
          <span class="team-names">{{ teamName(row.team) }}</span>
          <span class="team-score"><strong>{{ formatScore(row.total) }}</strong></span>
          <span class="stack" :aria-label="`Months: ${segments(row).map((segment) => formatScore(segment.value)).join(', ')}`">
            <span v-for="segment in segments(row)" :key="segment.index" class="stack-part" :class="{ live: segment.live }"
              :style="{ width: `${(segment.value / totalMax) * 100}%`, background: teamColor(row.slot) }" :title="`${monthLabel(key, segment.index)}: ${formatScore(segment.value)}`"></span>
          </span>
        </li>
      </ol>
      <p class="muted small rank-hint">One segment per month; the lighter segment is the month still running.</p>
    </template>
  </template>
  <p v-if="error" class="feedback error board-error" role="alert">{{ error }}</p>
  <button v-if="error" class="secondary" :disabled="loading" @click="$emit('refresh')"><RefreshCw :size="16" /> Try again</button>
  <div class="copy-feedback" aria-live="polite">
    <p v-if="copyMessage" class="feedback success"><Check :size="16" /> {{ copyMessage }}</p>
    <p v-if="copyError" class="feedback error" role="alert">{{ copyError }}</p>
  </div>
</template>

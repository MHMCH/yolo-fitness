<script setup lang="ts">
import { computed } from 'vue'
import { LoaderCircle, RefreshCw } from '@lucide/vue'
import LineChart from './LineChart.vue'
import { addDays } from '../lib/seasonChart'
import { buildTeamSeries, dayTicks, formatScore, monthLabel, monthRange, ordinal, quarterLabel, teamColor } from '../lib/teams'
import { displayDate } from '../lib/trainingDates'
import type { MonthTab } from '../composables/useTeams'
import type { Season, TeamDaily, TeamMonthRow, TeamQuarterRow } from '../types/database'

const props = defineProps<{
  season: Season | null; today: string; myName: string; quarter: number; month: MonthTab
  monthRows: TeamMonthRow[]; daily: TeamDaily[]; quarterRows: TeamQuarterRow[]; loading: boolean; error: string
}>()
const emit = defineEmits<{ 'update:quarter': [value: number]; 'update:month': [value: MonthTab]; retry: [] }>()

const start = computed(() => props.season?.starts_on ?? '')
const range = computed(() => props.season && props.month !== 'total' ? monthRange(start.value, props.quarter, props.month) : null)
const series = computed(() => range.value ? buildTeamSeries(props.monthRows, props.daily, range.value, props.today, props.myName) : [])
const ticks = computed(() => range.value ? dayTicks(range.value.lo, range.value.length) : [])
const dateLabel = (index: number) => displayDate(addDays(range.value!.lo, index))
const hasRows = computed(() => props.month === 'total' ? props.quarterRows.length > 0 : props.monthRows.length > 0)
const started = computed(() => props.monthRows.some((row) => row.started))
const closed = computed(() => props.monthRows.length > 0 && props.monthRows.every((row) => row.closed))
const mine = (members: string[]) => members.includes(props.myName)
const names = (members: string[]) => members.join(' + ')

const myMonthRow = computed(() => props.monthRows.find((row) => mine(row.members)))
const myQuarterRow = computed(() => props.quarterRows.find((row) => mine(row.members)))
const status = computed(() => {
  if (!range.value) return ''
  const last = displayDate(addDays(range.value.hi, -1))
  if (!started.value) return `Starts ${displayDate(range.value.lo)}`
  return closed.value ? `Closed · final result with bonus` : `Live · closes ${last}, 23:59`
})

const months = [1, 2, 3] as const
const monthClosed = (month: number) => props.season ? monthRange(start.value, props.quarter, month).hi <= props.today : false
const monthStarted = (month: number) => props.season ? monthRange(start.value, props.quarter, month).lo <= props.today : false
const totalMax = computed(() => Math.max(1, ...props.quarterRows.map((row) => row.total)))
const segments = (row: TeamQuarterRow) => months.map((month, index) => {
  const score = row.scores[index]
  const value = score === null || score === undefined ? 0 : score + (row.bonuses[index] ?? 0)
  return { month, value, live: monthStarted(month) && !monthClosed(month), width: (value / totalMax.value) * 100 }
}).filter((segment) => segment.value > 0)
const summary = computed(() => props.monthRows.map((row) => `${row.rank}. ${names(row.members)}, ${formatScore(row.average)}`).join('; '))
</script>

<template>
  <p class="eyebrow">{{ season ? season.name.toUpperCase() : 'SEASON' }}</p>
  <h1>Teams.</h1>
  <p v-if="!season && !loading" class="empty muted">There is no active season right now.</p>
  <template v-else-if="season">
    <div class="pill-row" role="tablist" aria-label="Quarter">
      <button v-for="number in 4" :key="number" class="pill" role="tab" :class="{ selected: quarter === number }" :aria-selected="quarter === number"
        @click="emit('update:quarter', number)"><strong>Q{{ number }}</strong><span>{{ quarterLabel(start, number) }}</span></button>
    </div>
    <div class="pill-row months" role="tablist" aria-label="Month">
      <button v-for="number in months" :key="number" class="pill" role="tab" :class="{ selected: month === number }" :aria-selected="month === number"
        @click="emit('update:month', number)">{{ monthLabel(start, quarter, number) }}</button>
      <button class="pill" role="tab" :class="{ selected: month === 'total' }" :aria-selected="month === 'total'" @click="emit('update:month', 'total')">Total</button>
    </div>

    <p v-if="loading && !hasRows" class="empty muted"><LoaderCircle class="spin" :size="20" aria-label="Loading teams" /></p>
    <p v-else-if="!hasRows && !error" class="empty muted">Teams for Q{{ quarter }} have not been drawn yet.</p>

    <template v-else-if="month !== 'total'">
      <p class="team-status muted small">{{ status }}</p>
      <div v-if="myMonthRow && started" class="your-team">
        <span class="eyebrow">YOUR TEAM</span>
        <span><strong>{{ ordinal(myMonthRow.rank) }}</strong> · {{ names(myMonthRow.members) }} ·
          {{ closed ? formatScore(myMonthRow.average + (myMonthRow.bonus ?? 0)) : `Ø ${formatScore(myMonthRow.average)}` }}</span>
      </div>
      <div v-if="started" class="ranking-chart">
        <LineChart :days="range!.length" :series="series" :ticks="ticks" :date-label="dateLabel" :summary="summary" :min-scale="2" zoom :min-days="7" />
      </div>
      <ol class="team-list">
        <li v-for="row in monthRows" :key="row.team_id" :class="{ me: mine(row.members) }">
          <span class="rank-place">{{ started ? row.rank : '' }}</span>
          <span class="team-chip" :style="{ background: teamColor(row.slot) }"></span>
          <span class="team-names">{{ names(row.members) }}</span>
          <span v-if="started" class="team-score">
            <strong>{{ row.closed ? formatScore(row.average + (row.bonus ?? 0)) : formatScore(row.average) }}</strong>
            <span class="muted small">{{ row.closed ? `${formatScore(row.average)} + ${row.bonus ?? 0}` : 'Ø per head' }}</span>
          </span>
        </li>
      </ol>
    </template>

    <template v-else>
      <p class="team-status muted small">Quarter total · closed months with bonus, running month without</p>
      <div v-if="myQuarterRow" class="your-team">
        <span class="eyebrow">YOUR TEAM</span>
        <span><strong>{{ ordinal(myQuarterRow.rank) }}</strong> · {{ names(myQuarterRow.members) }} · {{ formatScore(myQuarterRow.total) }}</span>
      </div>
      <ol class="team-list">
        <li v-for="row in quarterRows" :key="row.team_id" :class="{ me: mine(row.members) }" class="total-row">
          <span class="rank-place">{{ row.rank }}</span>
          <span class="team-chip" :style="{ background: teamColor(row.slot) }"></span>
          <span class="team-names">{{ names(row.members) }}</span>
          <span class="team-score"><strong>{{ formatScore(row.total) }}</strong></span>
          <span class="stack" :aria-label="`Months: ${segments(row).map((segment) => formatScore(segment.value)).join(', ')}`">
            <span v-for="segment in segments(row)" :key="segment.month" class="stack-part" :class="{ live: segment.live }"
              :style="{ width: `${segment.width}%`, background: teamColor(row.slot) }" :title="`${monthLabel(start, quarter, segment.month)}: ${formatScore(segment.value)}`"></span>
          </span>
        </li>
      </ol>
      <p class="muted small rank-hint">One segment per month; the lighter segment is the month still running.</p>
    </template>
  </template>
  <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
  <button v-if="error" class="secondary" :disabled="loading" @click="emit('retry')"><RefreshCw :size="16" /> Try again</button>
</template>

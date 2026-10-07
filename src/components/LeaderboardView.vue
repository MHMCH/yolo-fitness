<script setup lang="ts">
import { computed, ref } from 'vue'
import { Copy, LoaderCircle, Medal, Minus, RefreshCw, TrendingDown, TrendingUp } from '@lucide/vue'
import LineChart from './LineChart.vue'
import { useClipboard } from '../composables/useClipboard'
import { leaderboardText, type LeaderboardRow } from '../lib/league'
import { buildRankingSeries, MUTED_COLOR, PICKED_COLOR } from '../lib/ranking'
import { addDays, diffDays, monthTicks, seasonLength, type RefLine, type Season } from '../lib/seasonChart'
import { displayDate } from '../lib/trainingDates'
import type { DailyPoints } from '../types/database'

const GOAL = 100
const props = defineProps<{ season: Season; rows: LeaderboardRow[]; daily: DailyPoints[]; today: string; me: string; loaded: boolean; loading: boolean; error: string }>()
defineEmits<{ refresh: [] }>()
const picked = ref<string | null>(null)
const { copying, message: copyMessage, error: copyError, copy } = useClipboard(computed(() => props.me))

const length = computed(() => seasonLength(props.season.starts_on))
const todayIndex = computed(() => Math.min(Math.max(diffDays(props.season.starts_on, props.today), 0), length.value - 1))
const built = computed(() => props.rows.length
  ? buildRankingSeries(props.rows, props.daily, props.me, picked.value, props.season.starts_on, todayIndex.value)
  : { series: [], rivals: [] })
const refLines: RefLine[] = [{ value: GOAL, label: `Goal ${GOAL}`, color: 'var(--green)' }]
const ticks = computed(() => monthTicks(props.season.starts_on))
const dateLabel = (index: number) => displayDate(addDays(props.season.starts_on, index))
const scaleMax = computed(() => Math.max(GOAL, ...props.rows.map((row) => row.total_points)))
const places = ['', 'First place', 'Second place', 'Third place']
const medalClass = (rank: number) => ['', 'gold', 'silver', 'bronze'][rank]
const chipColor = (id: string) => {
  if (id === props.me) return 'var(--pink)'
  if (id === picked.value) return PICKED_COLOR
  return built.value.rivals.find((rival) => rival.id === id)?.color ?? MUTED_COLOR
}
const summary = computed(() => `Season leaderboard. ${props.rows.map((row) => `${row.rank}. ${row.display_name}, ${row.total_points} sessions`).join('; ')}`)
const toggle = (id: string) => { picked.value = picked.value === id ? null : id }
const canCopy = computed(() => props.loaded && !props.loading && !props.error && !copying.value && props.rows.length > 0)
</script>

<template>
  <div class="view-heading board-heading">
    <div><p class="eyebrow">{{ season.name.toUpperCase() }}</p><h1>Leaderboard.</h1></div>
    <div class="board-actions">
      <button class="icon-button" title="Copy leaderboard" aria-label="Copy leaderboard" :disabled="!canCopy" @click="copy(leaderboardText(rows), 'Leaderboard')">
        <LoaderCircle v-if="copying" class="spin" :size="20" /><Copy v-else :size="20" />
      </button>
      <button class="icon-button" title="Refresh" aria-label="Refresh" :disabled="loading" @click="$emit('refresh')"><RefreshCw :size="20" :class="{ spin: loading }" /></button>
    </div>
  </div>
  <p v-if="loading && !loaded" class="empty muted"><LoaderCircle class="spin" :size="20" aria-label="Loading leaderboard" /></p>
  <template v-else-if="loaded">
    <div class="ranking-chart">
      <LineChart :days="length" :series="built.series" :ref-lines="refLines" :ticks="ticks" :date-label="dateLabel" :summary="summary"
        :min-scale="10" zoom :format-value="(value) => String(Math.round(value))" />
    </div>
    <ol class="rank-list">
      <li v-for="row in rows" :key="row.user_id" :class="{ me: row.user_id === me }">
        <button class="rank-row" :aria-pressed="picked === row.user_id" @click="toggle(row.user_id)">
          <span class="rank-place">
            <Medal v-if="row.rank <= 3" :size="18" :class="medalClass(row.rank)" role="img" :aria-label="places[row.rank]" /><template v-else>{{ row.rank }}</template>
          </span>
          <span class="rank-chip" :style="{ background: chipColor(row.user_id) }"></span>
          <span class="rank-name">{{ row.display_name }}</span>
          <span class="rank-bar"><span class="rank-fill" :style="{ width: `${(row.total_points / scaleMax) * 100}%`, background: chipColor(row.user_id) }"></span>
            <span class="rank-goal" :style="{ left: `${(GOAL / scaleMax) * 100}%` }"></span></span>
          <span class="rank-count">{{ row.total_points }}</span>
          <span class="board-move" :class="{ up: row.movement > 0, down: row.movement < 0 }"
            :title="row.movement ? `${Math.abs(row.movement)} ${row.movement > 0 ? 'up' : 'down'} since yesterday` : 'No change since yesterday'">
            <TrendingUp v-if="row.movement > 0" :size="16" /><TrendingDown v-else-if="row.movement < 0" :size="16" /><Minus v-else :size="16" />
          </span>
        </button>
      </li>
    </ol>
    <p v-if="!rows.length" class="empty muted">No participants yet.</p>
    <p class="muted small rank-hint">Tap a name to highlight their line. Arrows compare with yesterday.</p>
  </template>
  <p v-if="error" class="feedback error board-error" role="alert">{{ error }}</p>
  <button v-if="error" class="secondary" :disabled="loading" @click="$emit('refresh')"><RefreshCw :size="16" /> Try again</button>
  <div class="copy-feedback" aria-live="polite">
    <p v-if="copyMessage" class="feedback success">{{ copyMessage }}</p>
    <p v-if="copyError" class="feedback error" role="alert">{{ copyError }}</p>
  </div>
</template>

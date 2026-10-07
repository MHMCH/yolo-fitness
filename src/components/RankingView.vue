<script setup lang="ts">
import { computed, ref } from 'vue'
import { LoaderCircle, RefreshCw } from '@lucide/vue'
import LineChart from './LineChart.vue'
import { buildRankingSeries, MUTED_COLOR, orderRows, PICKED_COLOR, type DailySeries, type RankingRow } from '../lib/ranking'
import { addDays, diffDays, monthTicks, seasonLength, type RefLine } from '../lib/seasonChart'
import { displayDate } from '../lib/trainingDates'
import type { Season } from '../types/database'

const GOAL = 100
const props = defineProps<{ season: Season | null; rows: RankingRow[]; daily: DailySeries[]; today: string; me: string; loading: boolean; error: string }>()
defineEmits<{ retry: [] }>()
const picked = ref<string | null>(null)

const length = computed(() => props.season ? seasonLength(props.season.starts_on) : 0)
const todayIndex = computed(() => props.season ? Math.min(Math.max(diffDays(props.season.starts_on, props.today), 0), length.value - 1) : 0)
const ordered = computed(() => orderRows(props.rows))
const built = computed(() => props.season && props.rows.length
  ? buildRankingSeries(props.rows, props.daily, props.me, picked.value, props.season.starts_on, todayIndex.value)
  : { series: [], rivals: [] })
const refLines: RefLine[] = [{ value: GOAL, label: `Goal ${GOAL}`, color: 'var(--green)' }]
const ticks = computed(() => props.season ? monthTicks(props.season.starts_on) : [])
const dateLabel = (index: number) => displayDate(addDays(props.season!.starts_on, index))
const scaleMax = computed(() => Math.max(GOAL, ...props.rows.map((row) => row.sessions)))
const chipColor = (id: string) => {
  if (id === props.me) return 'var(--pink)'
  if (id === picked.value) return PICKED_COLOR
  return built.value.rivals.find((rival) => rival.id === id)?.color ?? MUTED_COLOR
}
const summary = computed(() => `Season ranking. ${ordered.value.map((row) => `${row.rank}. ${row.display_name}, ${row.sessions} sessions`).join('; ')}`)
const toggle = (id: string) => { picked.value = picked.value === id ? null : id }
</script>

<template>
  <p class="eyebrow">{{ season ? season.name.toUpperCase() : 'SEASON' }}</p>
  <h1>Ranking.</h1>
  <p v-if="!season && !loading" class="empty muted">There is no active season right now.</p>
  <p v-else-if="loading && !rows.length" class="empty muted"><LoaderCircle class="spin" :size="20" aria-label="Loading ranking" /></p>
  <template v-else-if="season">
    <div class="ranking-chart">
      <LineChart :days="length" :series="built.series" :ref-lines="refLines" :ticks="ticks" :date-label="dateLabel" :summary="summary"
        :min-scale="10" zoom :format-value="(value) => String(Math.round(value))" />
    </div>
    <ol class="rank-list">
      <li v-for="row in ordered" :key="row.user_id" :class="{ me: row.user_id === me }">
        <button class="rank-row" :aria-pressed="picked === row.user_id" @click="toggle(row.user_id)">
          <span class="rank-place">{{ row.rank }}</span>
          <span class="rank-chip" :style="{ background: chipColor(row.user_id) }"></span>
          <span class="rank-name">{{ row.display_name }}</span>
          <span class="rank-bar"><span class="rank-fill" :style="{ width: `${(row.sessions / scaleMax) * 100}%`, background: chipColor(row.user_id) }"></span>
            <span class="rank-goal" :style="{ left: `${(GOAL / scaleMax) * 100}%` }"></span></span>
          <span class="rank-count">{{ row.sessions }}</span>
        </button>
      </li>
    </ol>
    <p class="muted small rank-hint">Tap a name to highlight their line.</p>
  </template>
  <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
  <button v-if="error" class="secondary" :disabled="loading" @click="$emit('retry')"><RefreshCw :size="16" /> Try again</button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LineChart from './LineChart.vue'
import { addDays, cumulativeByDay, diffDays, monthTicks, seasonLength, type ChartSeries, type RefLine } from '../lib/seasonChart'
import { displayDate } from '../lib/trainingDates'
import type { Season } from '../types/database'

const GOAL = 100
const props = defineProps<{ season: Season; days: string[]; today: string; lastYear: number | null }>()

const length = computed(() => seasonLength(props.season.starts_on))
const todayIndex = computed(() => Math.min(Math.max(diffDays(props.season.starts_on, props.today), 0), length.value - 1))
const values = computed(() => cumulativeByDay(props.days, props.season.starts_on, todayIndex.value))
const count = computed(() => values.value[values.value.length - 1] ?? 0)
const series = computed<ChartSeries[]>(() => [{
  id: 'me', label: 'You', color: 'var(--pink)', width: 3, values: values.value, emphasis: true,
}])
const refLines = computed<RefLine[]>(() => {
  const lines: RefLine[] = [{ value: GOAL, label: `Goal ${GOAL}`, color: 'var(--green)' }]
  if (props.lastYear !== null) lines.push({ value: props.lastYear, label: `Last year ${props.lastYear}`, color: '#9aa4d8' })
  return lines
})
const ticks = computed(() => monthTicks(props.season.starts_on))
const dateLabel = (index: number) => displayDate(addDays(props.season.starts_on, index))
const goalText = computed(() => count.value >= GOAL ? 'Goal reached.' : `${GOAL - count.value} to ${GOAL}`)
const lastYearText = computed(() => {
  if (props.lastYear === null) return ''
  if (count.value > props.lastYear) return 'Beat last year.'
  return `${props.lastYear + 1 - count.value} to beat last year`
})
const summary = computed(() => `Season progress: ${count.value} sessions. ${goalText.value}. ${lastYearText.value}`)
</script>

<template>
  <section class="season-progress" aria-label="Season progress">
    <div class="progress-heading"><span class="eyebrow">YOUR SEASON</span><span class="muted small">{{ count }} sessions</span></div>
    <LineChart :days="length" :series="series" :ref-lines="refLines" :ticks="ticks" :date-label="dateLabel" :summary="summary" :min-scale="10" zoom :format-value="(value) => String(Math.round(value))" />
    <p class="progress-note muted small">{{ goalText }}<template v-if="lastYearText"> · {{ lastYearText }}</template></p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { chartTop, recentPaceProjection, visibleDays, type ChartSeries, type RefLine, type Tick } from '../lib/seasonChart'

const props = defineProps<{
  days: number
  series: ChartSeries[]
  refLines?: RefLine[]
  ticks?: Tick[]
  summary: string
  dateLabel: (index: number) => string
  formatValue?: (value: number) => string
  minScale?: number
  capFactor?: number
  /** Show only the days up to today (plus margin) instead of the whole period. */
  zoom?: boolean
  /** Smallest number of days the zoomed axis shows (default 28). */
  minDays?: number
}>()

const W = 340, H = 210, L = 34, R = 46, T = 14, B = 26
const plotW = W - L - R
const plotH = H - T - B
const format = (value: number) => props.formatValue ? props.formatValue(value) : Number.isInteger(value) ? String(value) : value.toFixed(1)

const todayIndex = computed(() => Math.max(0, ...props.series.map((item) => item.values.length - 1)))
const top = computed(() => chartTop({
  currentMax: Math.max(0, ...props.series.map((item) => Math.max(0, ...item.values))),
  refMax: Math.max(0, ...(props.refLines ?? []).map((line) => line.value)),
  capFactor: props.capFactor,
  minScale: props.minScale,
}))
// Zooming is skipped when a projection is drawn, because that needs the whole period.
const shown = computed(() => props.zoom && !props.series.some((item) => item.projection) ? visibleDays(todayIndex.value, props.days, props.minDays) : props.days)
const x = (index: number) => L + (shown.value > 1 ? index / (shown.value - 1) : 0) * plotW
const MIN_TICK_GAP = 34
const visibleTicks = computed(() => {
  const kept: Tick[] = []
  for (const tick of [...(props.ticks ?? [])].sort((first, second) => first.index - second.index)) {
    if (tick.index > shown.value - 1) break
    if (!kept.length || x(tick.index) - x(kept[kept.length - 1].index) >= MIN_TICK_GAP) kept.push(tick)
  }
  return kept
})
const y = (value: number) => T + plotH * (1 - Math.min(value, top.value) / top.value)

const drawn = computed(() => [...props.series]
  .sort((first, second) => Number(Boolean(first.emphasis)) - Number(Boolean(second.emphasis)))
  .map((item) => {
    const count = item.values.length
    const last = count ? item.values[count - 1] : 0
    const line = item.values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join('')
    let projection: { path: string; endValue: number; overshoot: boolean; endX: number; endY: number } | null = null
    if (item.projection && count > 0 && count < props.days) {
      const { rate, end: endValue } = recentPaceProjection(item.values, props.days)
      const overshoot = endValue > top.value
      let endX = x(props.days - 1)
      if (overshoot) {
        // The projected line reaches the top of the axis on day index (today + (top - last) / rate).
        const crossing = count - 1 + (top.value - last) / rate
        endX = x(Math.min(props.days - 1, Math.max(count - 1, crossing)))
      }
      const endY = y(endValue)
      projection = { path: `M${x(count - 1).toFixed(1)},${y(last).toFixed(1)}L${endX.toFixed(1)},${endY.toFixed(1)}`, endValue, overshoot, endX, endY }
    }
    return { ...item, line, last, lastX: x(Math.max(0, count - 1)), lastY: y(last), projection }
  }))

// End labels sit just right of each projection's end; labels that would overlap are stacked downwards.
const endLabels = computed(() => {
  const placed: Array<{ id: string; x: number; y: number; text: string; color: string }> = []
  const wanted = drawn.value.flatMap((item) => {
    if (item.endLabel && item.projection) {
      return [{ id: item.id, color: item.color, x: item.projection.endX + 6, y: item.projection.endY + 4,
        text: `${item.projection.overshoot ? '↗ ' : ''}${format(item.projection.endValue)}` }]
    }
    // No projection to label (closed month, or the last day of the period): label the line's own end.
    const text = item.endText ?? (item.endLabel ? format(item.last) : '')
    if (text && item.values.length) return [{ id: item.id, color: item.color, x: item.lastX + 6, y: item.lastY + 4, text }]
    return []
  }).sort((first, second) => first.y - second.y || first.x - second.x)
  for (const label of wanted) {
    let y = Math.max(label.y, T + 8)
    while (placed.some((other) => Math.abs(other.x - label.x) < 38 && Math.abs(other.y - y) < 11)) y += 11
    placed.push({ ...label, y })
  }
  return placed
})

const yTicks = computed(() => [0, top.value / 2, top.value])
const refs = computed(() => {
  const sorted = [...(props.refLines ?? [])].sort((first, second) => second.value - first.value)
  return sorted.map((line, index) => ({
    ...line, y: y(line.value),
    // Labels sit above their line, except the lower of two lines which sits below to avoid overlap.
    labelY: index > 0 && sorted[index - 1] && Math.abs(y(sorted[index - 1].value) - y(line.value)) < 14 ? y(line.value) + 10 : y(line.value) - 4,
  }))
})

const hover = ref<number | null>(null)
const tipRows = computed(() => hover.value === null ? [] : props.series
  .map((item) => ({ id: item.id, label: item.label, color: item.color, emphasis: Boolean(item.emphasis),
    value: item.values[Math.min(hover.value as number, item.values.length - 1)] ?? 0 }))
  .sort((first, second) => second.value - first.value || first.label.localeCompare(second.label)))
const tipSide = computed(() => hover.value !== null && x(hover.value) > L + plotW / 2 ? 'left' : 'right')

function indexAt(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const position = ((event.clientX - rect.left) / rect.width) * W
  const raw = Math.round(((position - L) / plotW) * (shown.value - 1))
  return Math.min(Math.max(raw, 0), todayIndex.value)
}
function track(event: PointerEvent) { hover.value = indexAt(event) }
function begin(event: PointerEvent) {
  try { (event.currentTarget as Element).setPointerCapture(event.pointerId) } catch {}
  track(event)
}
function finish() { hover.value = null }
</script>

<template>
  <div class="chart">
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="summary" class="chart-svg"
      @pointerdown="begin" @pointermove="track" @pointerup="finish" @pointercancel="finish" @pointerleave="finish">
      <g class="chart-grid">
        <template v-for="tick in yTicks" :key="tick">
          <line :x1="L" :x2="W - R" :y1="y(tick)" :y2="y(tick)" />
          <text :x="L - 5" :y="y(tick) + 3" text-anchor="end">{{ format(tick) }}</text>
        </template>
        <text v-for="tick in visibleTicks" :key="tick.index" :x="x(tick.index)" :y="H - 8" text-anchor="middle">{{ tick.label }}</text>
      </g>
      <g v-for="line in refs" :key="line.label" class="chart-ref" :style="{ stroke: line.color, fill: line.color }">
        <line :x1="L" :x2="W - R" :y1="line.y" :y2="line.y" stroke-dasharray="2 4" />
        <text :x="L + 4" :y="line.labelY" stroke="none">{{ line.label }}</text>
      </g>
      <g v-for="item in drawn" :key="item.id" :style="{ stroke: item.color, fill: item.color }" :class="{ 'is-muted': item.muted }">
        <path :d="item.line" fill="none" :stroke-width="item.width ?? 2" stroke-linejoin="round" stroke-linecap="round" />
        <path v-if="item.projection" :d="item.projection.path" fill="none" :stroke-width="item.width ?? 2" stroke-dasharray="3 5" stroke-linecap="round" opacity=".7" />
        <circle v-if="item.values.length" :cx="item.lastX" :cy="item.lastY" :r="item.emphasis ? 4 : 2.5" stroke="none" />
      </g>
      <g class="chart-labels">
        <text v-for="label in endLabels" :key="label.id" class="chart-end" :x="label.x" :y="label.y" :style="{ fill: label.color }">{{ label.text }}</text>
      </g>
      <g v-if="hover !== null" class="chart-cursor">
        <line :x1="x(hover)" :x2="x(hover)" :y1="T" :y2="T + plotH" />
        <circle v-for="item in drawn.filter((entry) => entry.emphasis)" :key="item.id" :cx="x(hover)"
          :cy="y(item.values[Math.min(hover, item.values.length - 1)] ?? 0)" r="3.5" :style="{ fill: item.color }" />
      </g>
    </svg>
    <div v-if="hover !== null" class="chart-tip" :class="`tip-${tipSide}`" aria-hidden="true">
      <div class="tip-date">{{ dateLabel(hover) }}</div>
      <div v-for="row in tipRows" :key="row.id" class="tip-row" :class="{ strong: row.emphasis }">
        <span class="tip-dot" :style="{ background: row.color }"></span><span class="tip-name">{{ row.label }}</span><span class="tip-value">{{ format(row.value) }}</span>
      </div>
    </div>
  </div>
</template>

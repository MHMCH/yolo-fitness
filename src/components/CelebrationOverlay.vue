<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { burst, rain, starPoints, step, type Particle } from '../lib/confetti'

const emit = defineEmits<{ close: [] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const RAINBOW = ['#ff4d6d', '#ff8a3d', '#ffd23f', '#6fd08c', '#4cc9f0', '#8b7bff']
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let frame = 0
let particles: Particle[] = []
let last = 0
let elapsed = 0
let spawnedSecondBurst = false
let context: CanvasRenderingContext2D | null = null
let width = 0
let height = 0

function resize() {
  const element = canvas.value
  if (!element) return
  const ratio = window.devicePixelRatio || 1
  width = window.innerWidth
  height = window.innerHeight
  element.width = width * ratio
  element.height = height * ratio
  context = element.getContext('2d')
  context?.setTransform(ratio, 0, 0, ratio, 0, 0)
}

function draw(piece: Particle) {
  if (!context) return
  context.save()
  context.translate(piece.x, piece.y)
  context.rotate(piece.rotation)
  context.fillStyle = piece.color
  if (piece.shape === 'rect') context.fillRect(-piece.size / 2, -piece.size / 3, piece.size, piece.size * 0.66)
  else if (piece.shape === 'circle') { context.beginPath(); context.arc(0, 0, piece.size / 2.2, 0, Math.PI * 2); context.fill() }
  else {
    context.beginPath()
    starPoints(piece.size * 0.9).forEach(([x, y], index) => (index ? context!.lineTo(x, y) : context!.moveTo(x, y)))
    context.closePath()
    context.fill()
  }
  context.restore()
}

function tick(time: number) {
  const dt = Math.min(0.05, last ? (time - last) / 1000 : 0.016)
  last = time
  elapsed += dt
  if (elapsed < 5) particles.push(...rain(width, Math.max(1, Math.round(dt * 60 * 0.9))))
  if (elapsed > 1.1 && !spawnedSecondBurst) {
    spawnedSecondBurst = true
    particles.push(...burst(width, height, 'left', 50), ...burst(width, height, 'right', 50))
  }
  particles = step(particles, dt, height)
  context?.clearRect(0, 0, width, height)
  particles.forEach(draw)
  if (elapsed < 5 || particles.length) frame = requestAnimationFrame(tick)
}

function onKey(event: KeyboardEvent) { if (event.key === 'Escape') emit('close') }

onMounted(() => {
  button.value?.focus()
  window.addEventListener('keydown', onKey)
  if (reduced) return
  resize()
  window.addEventListener('resize', resize)
  particles = [...burst(width, height, 'left', 70), ...burst(width, height, 'right', 70)]
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="celebration" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
    <canvas ref="canvas" class="celebration-canvas" aria-hidden="true"></canvas>
    <svg class="celebration-stars" viewBox="0 0 100 100" aria-hidden="true">
      <polygon v-for="(star, index) in [[12, 18, 5], [86, 14, 4], [8, 70, 3.5], [92, 64, 5], [24, 90, 3], [76, 88, 4]]" :key="index"
        :points="starPoints(star[2]).map(([x, y]) => `${x + star[0]},${y + star[1]}`).join(' ')" :style="{ animationDelay: `${index * 0.35}s` }" />
    </svg>
    <div class="celebration-card">
      <svg class="rainbow" viewBox="0 0 200 104" aria-hidden="true">
        <path v-for="(color, index) in RAINBOW" :key="color" :d="`M ${10 + index * 9},100 A ${90 - index * 9},${90 - index * 9} 0 0 1 ${190 - index * 9},100`"
          pathLength="1" :stroke="color" :style="{ animationDelay: `${0.15 + index * 0.12}s` }" />
      </svg>
      <h2 id="celebration-title">Congrats, Buddy!</h2>
      <p>You just earned some new features!</p>
      <ul class="unlocked">
        <li>Season chart</li><li>Ranking</li><li>Teams</li>
      </ul>
      <button ref="button" class="primary" @click="emit('close')">Show me</button>
    </div>
  </div>
</template>

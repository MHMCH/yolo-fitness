export type Shape = 'rect' | 'circle' | 'star'
export type Particle = {
  x: number; y: number; vx: number; vy: number
  size: number; rotation: number; spin: number
  color: string; shape: Shape
}

export const PARTY_COLORS = ['#ff579b', '#ff8a3d', '#ffd23f', '#8fdab3', '#5ac8fa', '#7a8cff', '#c8a2ff']
export const GRAVITY = 900   // px / s²
const SHAPES: Shape[] = ['rect', 'rect', 'circle', 'star', 'star']

const pick = <Item>(items: Item[], random: () => number) => items[Math.floor(random() * items.length)]

function make(x: number, y: number, vx: number, vy: number, random: () => number): Particle {
  return {
    x, y, vx, vy, size: 6 + random() * 9, rotation: random() * Math.PI * 2, spin: (random() - 0.5) * 12,
    color: pick(PARTY_COLORS, random), shape: pick(SHAPES, random),
  }
}

/** A party popper: pieces shot upwards and inwards from a bottom corner. */
export function burst(width: number, height: number, side: 'left' | 'right', count: number, random: () => number = Math.random): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = (60 + (random() - 0.5) * 36) * Math.PI / 180   // degrees above the floor
    const speed = 650 + random() * 550
    const direction = side === 'left' ? 1 : -1
    return make(side === 'left' ? 0 : width, height, Math.cos(angle) * speed * direction, -Math.sin(angle) * speed, random)
  })
}

/** Pieces drifting in from above the top edge. */
export function rain(width: number, count: number, random: () => number = Math.random): Particle[] {
  return Array.from({ length: count }, () => make(random() * width, -20 - random() * 40, (random() - 0.5) * 80, 60 + random() * 140, random))
}

/** Advance by `dt` seconds with gravity and air drag; pieces that have left the bottom are dropped. */
export function step(particles: Particle[], dt: number, height: number): Particle[] {
  const drag = Math.pow(0.992, dt * 60)
  return particles
    .map((piece) => ({
      ...piece, x: piece.x + piece.vx * dt, y: piece.y + piece.vy * dt,
      vx: piece.vx * drag, vy: Math.min(piece.vy * drag + GRAVITY * dt, 520), rotation: piece.rotation + piece.spin * dt,
    }))
    .filter((piece) => piece.y < height + 40)
}

/** Corner points of a five-pointed star centred on 0,0. */
export function starPoints(radius: number): Array<[number, number]> {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5
    const length = index % 2 === 0 ? radius : radius * 0.45
    return [Math.cos(angle) * length, Math.sin(angle) * length]
  })
}

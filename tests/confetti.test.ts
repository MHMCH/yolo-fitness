import { describe, expect, it } from 'vitest'
import { burst, GRAVITY, PARTY_COLORS, rain, starPoints, step } from '../src/lib/confetti'

const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

describe('confetti particles', () => {
  it('shoots a burst upwards and inwards from the chosen bottom corner', () => {
    const left = burst(400, 800, 'left', 30, seeded(1))
    const right = burst(400, 800, 'right', 30, seeded(1))
    expect(left).toHaveLength(30)
    expect(left.every((piece) => piece.x === 0 && piece.y === 800 && piece.vx > 0 && piece.vy < 0)).toBe(true)
    expect(right.every((piece) => piece.x === 400 && piece.vx < 0 && piece.vy < 0)).toBe(true)
  })
  it('lets rain start above the screen, inside its width', () => {
    const pieces = rain(400, 40, seeded(2))
    expect(pieces.every((piece) => piece.y < 0 && piece.x >= 0 && piece.x <= 400 && piece.vy > 0)).toBe(true)
  })
  it('uses the party palette and all three shapes', () => {
    const pieces = [...burst(400, 800, 'left', 60, seeded(3)), ...rain(400, 60, seeded(4))]
    expect(pieces.every((piece) => PARTY_COLORS.includes(piece.color))).toBe(true)
    expect(new Set(pieces.map((piece) => piece.shape))).toEqual(new Set(['rect', 'circle', 'star']))
  })
  it('is deterministic for a given random source', () => {
    expect(burst(400, 800, 'left', 5, seeded(9))).toEqual(burst(400, 800, 'left', 5, seeded(9)))
  })
  it('moves, accelerates downwards and spins', () => {
    const [before] = burst(400, 800, 'left', 1, seeded(5))
    const [after] = step([before], 0.1, 800)
    expect(after.x).toBeGreaterThan(before.x)
    expect(after.y).toBeLessThan(before.y)
    expect(after.vy).toBeGreaterThan(before.vy)
    expect(after.rotation).not.toBe(before.rotation)
  })
  it('limits the falling speed and removes pieces below the screen', () => {
    const [fast] = step([{ ...rain(400, 1, seeded(6))[0], y: 100, vy: 5000 }], 0.01, 800)
    expect(fast.vy).toBeLessThanOrEqual(520)
    expect(step([{ ...rain(400, 1, seeded(7))[0], y: 900 }], 0.016, 800)).toEqual([])
    expect(GRAVITY).toBeGreaterThan(0)
  })
  it('draws a five-pointed star with alternating radii', () => {
    const points = starPoints(10)
    expect(points).toHaveLength(10)
    expect(Math.hypot(...points[0])).toBeCloseTo(10)
    expect(Math.hypot(...points[1])).toBeCloseTo(4.5)
  })
})

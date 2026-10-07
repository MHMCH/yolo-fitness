import { describe, expect, it } from 'vitest'
import { registerTap } from '../src/lib/testMode'

function tapsAt(moments: number[]) {
  let times: number[] = []
  return moments.map((moment) => { const result = registerTap(times, moment); times = result.times; return result.triggered })
}

describe('test mode gesture', () => {
  it('triggers on the fifth tap within three seconds', () => {
    expect(tapsAt([0, 400, 800, 1200, 1600])).toEqual([false, false, false, false, true])
  })
  it('does not trigger when the taps are too slow', () => {
    expect(tapsAt([0, 1000, 2000, 3000, 4000, 5000, 6000]).some(Boolean)).toBe(false)
  })
  it('forgets old taps, so a sixth tap never counts as an early fifth', () => {
    expect(tapsAt([0, 500, 1000, 1500, 5000, 5400, 5800, 6200])).toEqual([false, false, false, false, false, false, false, false])
  })
  it('starts counting again after it triggered, so it can be switched off the same way', () => {
    expect(tapsAt([0, 100, 200, 300, 400, 500, 600, 700, 800, 900])).toEqual([false, false, false, false, true, false, false, false, false, true])
  })
})

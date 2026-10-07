import { ref } from 'vue'
import { registerTap } from '../lib/testMode'

const storageKey = 'yolo-fitness:test-mode'

function read() {
  try { return localStorage.getItem(storageKey) === 'on' } catch { return false }
}

/** A switch stored only in this browser: five quick taps turn it on or off. */
export function useTestMode() {
  const armed = ref(read())
  let taps: number[] = []
  /** Returns the new state when this tap completed the gesture, otherwise null. */
  function tap(): boolean | null {
    const result = registerTap(taps, Date.now())
    taps = result.times
    if (!result.triggered) return null
    armed.value = !armed.value
    try { localStorage.setItem(storageKey, armed.value ? 'on' : 'off') } catch { /* the switch then lasts until reload */ }
    return armed.value
  }
  return { armed, tap }
}

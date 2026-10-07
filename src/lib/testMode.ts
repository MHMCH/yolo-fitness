export const TAPS_NEEDED = 5
export const TAP_WINDOW_MS = 3000

/** Records a tap and reports whether it completes the gesture: five taps within three seconds. */
export function registerTap(times: number[], now: number, needed = TAPS_NEEDED, windowMs = TAP_WINDOW_MS): { times: number[]; triggered: boolean } {
  const recent = [...times.filter((time) => now - time <= windowMs), now]
  return recent.length >= needed ? { times: [], triggered: true } : { times: recent, triggered: false }
}

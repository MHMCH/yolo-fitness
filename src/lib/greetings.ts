// Street-style greetings for the Home screen, by weekday and time of day (Berlin time, like the rest of the app).
// Self-contained on purpose: to remove the feature, set `streetGreetings` to false in src/config/release.ts
// or delete this file together with its few uses in App.vue.

export type Slot = 'early' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late' | 'night'

const LINES: Record<Slot, string[]> = {
  early: ['Rise and grind, {n}.', 'Up before the sun, {n}.', 'Early bird mode, {n}.'],
  morning: ["What's good, {n}?", 'Coffee, then iron, {n}.', 'Fresh legs, {n}?'],
  midday: ['Lunch-break pump, {n}?', 'Midday check-in, {n}.', 'Skip the nap, {n}?'],
  afternoon: ['Afternoon gains, {n}.', 'Warm-up time, {n}?', 'Stay loose, {n}.'],
  evening: ['Prime time, {n}.', 'After-work session, {n}?', 'Evening grind, {n}.'],
  late: ['Night shift, {n}?', 'Late-night iron, {n}.', 'Last call, {n}?'],
  night: ['Nighthawk mode, {n}.', 'Still up, {n}? Respect.', 'Midnight oil, {n}.'],
}
const DONE_LINES = ['Already crushed it, {n}.', 'Logged and loaded, {n}.', "Today's done, {n}. Respect."]
/** Monday first. */
const WEEKDAYS = ['MONDAY RESET', 'TUESDAY GRIND', 'MIDWEEK PUSH', 'THURSDAY THUNDER', 'FRIDAY GAINS', 'SATURDAY SESSION', 'SUNDAY RESET']
const CONFIRMATIONS: Record<Slot, string[]> = {
  early: ['Early bird gets the gains. Session logged.', 'Yeah buddy. Session logged.'],
  morning: ['Morning iron done. Session logged.', 'Yeah buddy. Session logged.'],
  midday: ['Lunch-break pump done. Session logged.', 'Yeah buddy. Session logged.'],
  afternoon: ['Afternoon gains secured. Session logged.', 'Yeah buddy. Session logged.'],
  evening: ['Prime time, done. Session logged.', 'Yeah buddy. Session logged.'],
  late: ['Night shift done. Session logged.', 'Yeah buddy. Session logged.'],
  night: ['Nighthawk. Session logged.', 'Yeah buddy. Session logged.'],
}

export const GREETING_TEXT = { LINES, DONE_LINES, WEEKDAYS, CONFIRMATIONS }

export function slotFor(hour: number): Slot {
  if (hour < 5) return 'night'
  if (hour < 9) return 'early'
  if (hour < 12) return 'morning'
  if (hour < 14) return 'midday'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'late'
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

/** Date, hour (0-23) and weekday (0 = Monday) in Berlin. */
export function berlinClock(now: Date): { date: string; hour: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    hour: Number(part('hour')) % 24,
    weekday: WEEKDAY_INDEX[part('weekday')],
  }
}

/** A stable pick: the same day, slot and name always give the same variant, so the line does not flicker. */
function pick<Item>(items: Item[], seed: string): Item {
  let hash = 2166136261
  for (const char of seed) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return items[(hash >>> 0) % items.length]
}

const shorten = (name: string) => name.length > 16 ? `${name.slice(0, 15)}…` : name

export function greeting(now: Date, name: string, trainedToday: boolean): { eyebrow: string; title: string } {
  const { date, hour, weekday } = berlinClock(now)
  const slot = slotFor(hour)
  const lines = trainedToday ? DONE_LINES : LINES[slot]
  return {
    eyebrow: WEEKDAYS[weekday],
    title: pick(lines, `${date}|${trainedToday ? 'done' : slot}|${name}`).replace('{n}', shorten(name)),
  }
}

/** The line shown after a confirmed save, for example "Morning iron done. Session logged." */
export function confirmation(now: Date): string {
  const { date, hour } = berlinClock(now)
  const slot = slotFor(hour)
  return pick(CONFIRMATIONS[slot], `${date}|${slot}`)
}

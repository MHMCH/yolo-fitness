import { describe, expect, it } from 'vitest'
import { berlinClock, confirmation, greeting, GREETING_TEXT, slotFor } from '../src/lib/greetings'

const at = (iso: string) => new Date(iso)

describe('time slots', () => {
  it('splits the day at 5, 9, 12, 14, 17 and 21', () => {
    expect([0, 4, 5, 8, 9, 11, 12, 13, 14, 16, 17, 20, 21, 23].map(slotFor)).toEqual([
      'night', 'night', 'early', 'early', 'morning', 'morning', 'midday', 'midday', 'afternoon', 'afternoon', 'evening', 'evening', 'late', 'late'])
  })
})

describe('Berlin clock', () => {
  it('uses Berlin time in summer and winter', () => {
    expect(berlinClock(at('2026-10-07T08:30:00Z'))).toEqual({ date: '2026-10-07', hour: 10, weekday: 2 })    // Wednesday, summer time
    expect(berlinClock(at('2026-12-07T08:30:00Z'))).toEqual({ date: '2026-12-07', hour: 9, weekday: 0 })     // Monday, winter time
  })
  it('crosses midnight before UTC does and never reports hour 24', () => {
    expect(berlinClock(at('2026-09-30T22:30:00Z'))).toEqual({ date: '2026-10-01', hour: 0, weekday: 3 })
    expect(berlinClock(at('2026-10-04T21:59:00Z')).hour).toBe(23)
  })
})

describe('greeting', () => {
  const wednesdayMorning = at('2026-10-07T08:30:00Z')   // 10:30 in Berlin
  it('combines the weekday line with a greeting for the time of day', () => {
    const result = greeting(wednesdayMorning, 'Max')
    expect(result.eyebrow).toBe('MIDWEEK PUSH')
    expect(GREETING_TEXT.LINES.morning.map((line) => line.replace('{n}', 'Max'))).toContain(result.title)
  })
  it('is stable within a slot and day', () => {
    const first = greeting(at('2026-10-07T08:00:00Z'), 'Max')
    expect(greeting(at('2026-10-07T09:55:00Z'), 'Max')).toEqual(first)
  })
  it('varies over days and slots', () => {
    const titles = new Set(Array.from({ length: 14 }, (_, day) => greeting(at(`2026-10-${String(day + 1).padStart(2, '0')}T08:30:00Z`), 'Max').title))
    expect(titles.size).toBeGreaterThan(1)
    expect(greeting(at('2026-10-07T19:30:00Z'), 'Max').title).not.toBe(greeting(wednesdayMorning, 'Max').title)
  })
  it('shortens very long names', () => {
    expect(greeting(wednesdayMorning, 'Maximilian-Alexander-Theodor').title).toContain('Maximilian-Alex…')
  })
  it('knows a line for every weekday and time of day, with a name placeholder', () => {
    expect(GREETING_TEXT.WEEKDAYS).toHaveLength(7)
    for (const lines of Object.values(GREETING_TEXT.LINES)) {
      expect(lines.length).toBeGreaterThanOrEqual(3)
      for (const line of lines) expect(line).toContain('{n}')
    }
    for (let hour = 0; hour < 24; hour++) {
      const title = greeting(new Date(Date.UTC(2026, 9, 7, hour - 2)), 'Max').title
      expect(title, `hour ${hour}`).toContain('Max')
      expect(title).not.toContain('{n}')
    }
  })
})

describe('confirmation', () => {
  it('always ends with the plain confirmation and fits the time of day', () => {
    for (let hour = 0; hour < 24; hour++) {
      const line = confirmation(new Date(Date.UTC(2026, 9, 7, hour - 2)))
      expect(line.endsWith('Session logged.'), line).toBe(true)
    }
    expect(['Morning iron done. Session logged.', 'Yeah buddy. Session logged.']).toContain(confirmation(at('2026-10-07T08:30:00Z')))
  })
})

import { describe, expect, it } from 'vitest'
import { berlinDate, monthBounds, validTrainingDate, displayDate } from '../src/lib/trainingDates'

describe('Berlin training calendar', () => {
  it('crosses midnight and month before UTC', () => {
    expect(berlinDate(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10-01')
  })
  it('handles winter and summer offsets', () => {
    expect(berlinDate(new Date('2026-01-31T23:30:00Z'))).toBe('2026-02-01')
    expect(berlinDate(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30')
    expect(berlinDate(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25')
  })
  it('rolls December into the next year', () => {
    expect(monthBounds('2026-12-31')).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })
  it('rejects future and impossible dates', () => {
    expect(validTrainingDate('2026-10-05', '2026-10-04')).toBe(false)
    expect(validTrainingDate('2026-02-29', '2026-10-04')).toBe(false)
    expect(validTrainingDate('2024-02-29', '2026-10-04')).toBe(true)
    expect(validTrainingDate('2026-10-04', '2026-10-04')).toBe(true)
  })
  it('formats date-only entries without local timezone shifts', () => {
    expect(displayDate('2026-10-01')).toBe('1 Oct 2026')
  })
})
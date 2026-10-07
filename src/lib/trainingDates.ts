export const TRAINING_TIMEZONE = 'Europe/Berlin'

export function berlinDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TRAINING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function monthBounds(date: string) {
  const [year, month] = date.split('-').map(Number)
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`,
  }
}

export function validTrainingDate(date: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '0001-01-01' || date > today) return false
  const parsed = new Date(`${date}T12:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

export function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function displayMonth(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long' })
    .format(new Date(`${date}T12:00:00Z`))
}
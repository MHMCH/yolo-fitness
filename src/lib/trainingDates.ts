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

export function quarterBounds(date: string) {
  const year = Number(date.slice(0, 4))
  const first = Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1
  const months = [0, 1, 2].map((offset) => `${year}-${String(first + offset).padStart(2, '0')}-01`)
  return { key: `${year}-Q${(first + 2) / 3}`, start: months[0], end: monthBounds(months[2]).end, months }
}

export function isMonthClosed(month: string, today: string): boolean {
  return today >= monthBounds(month).end
}

export function daysUntilMonthEnd(today: string): number {
  return (Date.parse(`${monthBounds(today).end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000
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
import type { LeaderboardRow } from './league'
import { formatScore, type MonthRow, type TotalRow } from './teams'

// Chat-style text for pasting into a group chat (WhatsApp formatting: *bold*). It is the same for everybody,
// so it never highlights the person who copies it.

const MEDALS = ['', '🥇', '🥈', '🥉']

/** Names are shown as plain text: WhatsApp formatting characters and line breaks would break the layout. */
export const plain = (text: string) => text.replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim()

const place = (rank: number, medal: boolean) => rank <= 3 && medal ? MEDALS[rank] : `${rank}.`
const bold = (text: string, on: boolean) => on ? `*${text}*` : text

/** "7 Oct" for a date such as 2026-10-07. */
export function shortDate(date: string): string {
  const month = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' }).format(new Date(`${date}T12:00:00Z`))
  return `${Number(date.slice(8, 10))} ${month}`
}

const arrow = (movement: number) => movement > 0 ? `▲${movement}` : movement < 0 ? `▼${Math.abs(movement)}` : '–'

export function leaderboardChat(rows: LeaderboardRow[], seasonName: string, today: string): string {
  const lines = rows.map((row) => `${place(row.rank, true)} ${bold(plain(row.display_name), row.rank <= 3)} · ${row.total_points} ${arrow(row.movement)}`)
  return [`🏆 *Leaderboard · ${seasonName}*`, `As of ${shortDate(today)}`, '', ...lines, '', '▲▼ = places since yesterday'].join('\n')
}

/** One month of the league. `status` is shown in brackets, for example "running, ends 31 Oct". */
export function monthChat(rows: MonthRow[], heading: string, status: string, teamName: (team: string[]) => string): string {
  const closed = rows.length > 0 && rows.every((row) => row.closed)
  const lines = rows.map((row) => {
    const medal = row.average > 0
    const score = closed
      ? row.bonus ? `${formatScore(row.average + row.bonus)} (${formatScore(row.average)} + ${row.bonus})` : formatScore(row.average)
      : `Ø ${formatScore(row.average)}${row.bonus ? ` (+${row.bonus})` : ''}`
    return `${place(row.rank, medal)} ${bold(plain(teamName(row.team)), medal && row.rank <= 3)} · ${score}`
  })
  const footer = closed ? [] : ['', 'Bonus at month end, as it stands: 🥇 +3 · 🥈 +2 · 🥉 +1']
  return [`🏅 *League · ${heading}* (${status})`, '', ...lines, ...footer].join('\n')
}

/** The quarter total with each month's result in brackets. */
export function totalChat(rows: TotalRow[], heading: string, teamName: (team: string[]) => string): string {
  const lines = rows.map((row) => {
    const medal = row.total > 0
    const months = row.months.filter((value): value is number => value !== null)
    const breakdown = months.length > 1 ? ` (${months.map(formatScore).join(' · ')})` : ''
    return `${place(row.rank, medal)} ${bold(plain(teamName(row.team)), medal && row.rank <= 3)} · ${formatScore(row.total)}${breakdown}`
  })
  return [`🏅 *League · ${heading} · Total*`, '', ...lines, '', 'Closed months count with bonus, the running month without.'].join('\n')
}

import { describe, expect, it } from 'vitest'
import { leaderboardChat, monthChat, plain, shortDate, totalChat } from '../src/lib/chatText'
import type { MonthRow, TotalRow } from '../src/lib/teams'

const names = (team: string[]) => team.join(' & ')

describe('chat text', () => {
  it('formats short dates and strips chat formatting from names', () => {
    expect(shortDate('2026-10-07')).toBe('7 Oct')
    expect(shortDate('2026-09-30')).toBe('30 Sep')
    expect(plain('  *Ann*\n_B_ ~C~ `D`  ')).toBe('Ann B C D')
  })

  it('writes the leaderboard with medals, bold top three, arrows and shared places', () => {
    const rows = [
      { user_id: 'a', display_name: 'Marco', total_points: 81, points_before_today: 79, rank: 1, movement: 2 },
      { user_id: 'b', display_name: 'Jonas', total_points: 78, points_before_today: 78, rank: 2, movement: 0 },
      { user_id: 'c', display_name: 'Tobi', total_points: 70, points_before_today: 70, rank: 3, movement: -1 },
      { user_id: 'd', display_name: 'Jens', total_points: 48, points_before_today: 48, rank: 4, movement: 0 },
      { user_id: 'e', display_name: 'A*x_el', total_points: 48, points_before_today: 40, rank: 4, movement: 1 },
    ]
    expect(leaderboardChat(rows, 'Season 2026/27', '2026-10-07')).toBe([
      '🏆 *Leaderboard · Season 2026/27*',
      'As of 7 Oct',
      '',
      '🥇 *Marco* · 81 ▲2',
      '🥈 *Jonas* · 78 –',
      '🥉 *Tobi* · 70 ▼1',
      '4. Jens · 48 –',
      '4. Axel · 48 ▲1',
      '',
      '▲▼ = places since yesterday',
    ].join('\n'))
  })

  const row = (overrides: Partial<MonthRow>): MonthRow => ({ team: ['A', 'B'], slot: 1, average: 5, rank: 1, bonus: 3, started: true, closed: false, ...overrides })

  it('writes a running month with the bonus as it stands and no medal for an empty score', () => {
    const rows = [
      row({}), row({ team: ['C', 'D'], slot: 2, average: 2.5, rank: 2, bonus: 2 }), row({ team: ['E', 'F', 'G'], slot: 3, average: 2, rank: 3, bonus: 1 }),
      row({ team: ['H', 'I'], slot: 4, average: 1.5, rank: 4, bonus: 0 }), row({ team: ['J', 'K'], slot: 5, average: 0, rank: 5, bonus: 0 }),
    ]
    expect(monthChat(rows, 'Q4 2026 · Oct', 'running, ends 31 Oct', names)).toBe([
      '🏅 *League · Q4 2026 · Oct* (running, ends 31 Oct)',
      '',
      '🥇 *A & B* · Ø 5 (+3)',
      '🥈 *C & D* · Ø 2.5 (+2)',
      '🥉 *E & F & G* · Ø 2 (+1)',
      '4. H & I · Ø 1.5',
      '5. J & K · Ø 0',
      '',
      'Bonus at month end, as it stands: 🥇 +3 · 🥈 +2 · 🥉 +1',
    ].join('\n'))
  })

  it('writes a closed month with the final result and its breakdown', () => {
    const rows = [
      row({ average: 13.5, bonus: 3, closed: true }), row({ team: ['C', 'D'], slot: 2, average: 11.5, rank: 2, bonus: 2, closed: true }),
      row({ team: ['H', 'I'], slot: 3, average: 7, rank: 4, bonus: 0, closed: true }),
    ]
    expect(monthChat(rows, 'Q4 2026 · Sep', 'closed', names)).toBe([
      '🏅 *League · Q4 2026 · Sep* (closed)',
      '',
      '🥇 *A & B* · 16.5 (13.5 + 3)',
      '🥈 *C & D* · 13.5 (11.5 + 2)',
      '4. H & I · 7',
    ].join('\n'))
  })

  it('writes the quarter total with each month in brackets', () => {
    const total = (overrides: Partial<TotalRow>): TotalRow => ({ team: ['A', 'B'], slot: 1, months: [16.5, 14, null], liveMonth: 1, total: 30.5, rank: 1, ...overrides })
    const rows = [total({}), total({ team: ['C', 'D'], slot: 2, months: [4.5, null, null], total: 4.5, rank: 2, liveMonth: null }), total({ team: ['E', 'F'], slot: 3, months: [0, 0, null], total: 0, rank: 3 })]
    expect(totalChat(rows, 'Q4 2026', names)).toBe([
      '🏅 *League · Q4 2026 · Total*',
      '',
      '🥇 *A & B* · 30.5 (16.5 · 14)',
      '🥈 *C & D* · 4.5',
      '3. E & F · 0 (0 · 0)',
      '',
      'Closed months count with bonus, the running month without.',
    ].join('\n'))
  })
})

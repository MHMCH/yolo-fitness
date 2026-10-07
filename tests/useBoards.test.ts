// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useBoards } from '../src/composables/useBoards'
import type { BoardRepository } from '../src/lib/boardRepository'

vi.mock('../src/lib/supabase', () => ({ supabase: null }))

function createRepository() {
  return {
    leaderboard: vi.fn<BoardRepository['leaderboard']>().mockResolvedValue([
      { user_id: 'a', display_name: 'Ann', total_points: 3, points_before_today: 3 },
      { user_id: 'b', display_name: 'Ben', total_points: 4, points_before_today: 2 },
    ]),
    monthlyPoints: vi.fn<BoardRepository['monthlyPoints']>().mockResolvedValue([{ user_id: 'a', month: '2026-10-01', points: 2 }]),
  } satisfies BoardRepository
}

describe('useBoards', () => {
  const config = { '2026-Q4': [['a', 'missing'], ['b']], '2027-Q1': [['a'], ['b']] }

  it('loads the leaderboard and only quarters that have started', async () => {
    const repository = createRepository()
    const boards = useBoards(ref('account-a'), () => repository, () => config, () => '2026-10-06')
    await boards.refresh()
    expect(repository.monthlyPoints).toHaveBeenCalledExactlyOnceWith('2026-10-01', '2027-01-01')
    expect(boards.leaderboard.value.map((row) => [row.display_name, row.rank, row.movement])).toEqual([['Ben', 1, 1], ['Ann', 2, -1]])
    expect(boards.table.value.map((row) => [boards.teamName(row.team), row.monthAverage])).toEqual([['Ann & Unknown', 1], ['Ben', 0]])
    expect(boards.winners.value).toEqual([])
  })

  it('reports failures and clears data when the account changes', async () => {
    const repository = createRepository()
    const identity = ref('account-a')
    const boards = useBoards(identity, () => repository, () => config, () => '2026-10-06')
    await boards.refresh()
    identity.value = 'account-b'
    await nextTick()
    expect(boards.leaderboard.value).toEqual([])
    expect(boards.loaded.value).toBe(false)
    repository.leaderboard.mockRejectedValueOnce(new Error('offline'))
    await boards.refresh()
    expect(boards.error.value).toMatch(/Could not load/)
    expect(boards.loading.value).toBe(false)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { commitSession, type SessionRepository } from '../src/lib/sessionRepository'
import type { TrainingSession } from '../src/types/database'

describe('idempotent logging', () => {
  const request = { id: 'fixed-request-id', trained_on: '2026-10-04' }
  const row: TrainingSession = { ...request, user_id: 'owner', created_at: '2026-10-04T10:00:00Z' }
  it('inserts a new entry once', async () => {
    const repository = { find: vi.fn().mockResolvedValue(null), insert: vi.fn().mockResolvedValue(undefined) } as unknown as SessionRepository
    await commitSession(repository, request)
    expect(repository.insert).toHaveBeenCalledExactlyOnceWith(request)
  })
  it('does not insert an entry already acknowledged by the database', async () => {
    const repository = { find: vi.fn().mockResolvedValue(row), insert: vi.fn() } as unknown as SessionRepository
    await commitSession(repository, request)
    expect(repository.insert).not.toHaveBeenCalled()
  })
  it('reconciles a saved entry after losing the insert response', async () => {
    const repository = { find: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(row), insert: vi.fn().mockRejectedValue(new Error('Network')) } as unknown as SessionRepository
    await expect(commitSession(repository, request)).resolves.toBeUndefined()
    expect(repository.insert).toHaveBeenCalledOnce()
  })
  it('keeps a failed request retryable when no row exists', async () => {
    const repository = { find: vi.fn().mockResolvedValue(null), insert: vi.fn().mockRejectedValue(new Error('Network')) } as unknown as SessionRepository
    await expect(commitSession(repository, request)).rejects.toThrow('Network')
  })
})
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue'
import { useTrainingSessions } from '../src/composables/useTrainingSessions'
import type { InsertRequest, SessionRepository } from '../src/lib/sessionRepository'
import type { Summary, TrainingSession } from '../src/types/database'

vi.mock('../src/lib/supabase', () => ({ supabase: null }))

const firstId = '11111111-1111-4111-8111-111111111111'
const secondId = '22222222-2222-4222-8222-222222222222'
const trainingDate = '2020-01-02'
const stats: Summary = { today: '2026-10-04', month_count: 2, total_count: 5 }
const pendingKey = (owner: string) => `yolo-fitness:pending:${owner}`
const savedRow = (request: InsertRequest, owner = 'account-a'): TrainingSession => ({
  id: request.id,
  trained_on: request.trained_on ?? trainingDate,
  user_id: owner,
  created_at: '2026-10-04T10:00:00Z',
})

function deferred<Value>() {
  let resolve!: (value: Value | PromiseLike<Value>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createRepository() {
  return {
    summary: vi.fn<SessionRepository['summary']>().mockResolvedValue(stats),
    history: vi.fn<SessionRepository['history']>().mockResolvedValue([]),
    find: vi.fn<SessionRepository['find']>().mockResolvedValue(null),
    insert: vi.fn<SessionRepository['insert']>().mockResolvedValue(undefined),
    remove: vi.fn<SessionRepository['remove']>().mockResolvedValue(undefined),
  } satisfies SessionRepository
}

type Repository = ReturnType<typeof createRepository>

function holdInsert(repository: Repository) {
  const entered = deferred<InsertRequest>()
  const result = deferred<void>()
  repository.insert.mockImplementationOnce(request => {
    entered.resolve(request)
    return result.promise
  })
  return { entered: entered.promise, ...result }
}

describe('useTrainingSessions', () => {
  let scopes: EffectScope[]
  let connection: { onLine: boolean }
  let browserWindow: EventTarget & {
    setInterval: ReturnType<typeof vi.fn>
    clearInterval: ReturnType<typeof vi.fn>
  }
  let browserDocument: EventTarget & { visibilityState: string }
  let storage: Map<string, string>

  beforeEach(() => {
    scopes = []
    storage = new Map()
    connection = { onLine: true }
    browserWindow = Object.assign(new EventTarget(), {
      setInterval: vi.fn().mockReturnValue(1),
      clearInterval: vi.fn(),
    })
    browserDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    vi.stubGlobal('navigator', connection)
    vi.stubGlobal('window', browserWindow)
    vi.stubGlobal('document', browserDocument)
    vi.stubGlobal('setInterval', browserWindow.setInterval)
    vi.stubGlobal('clearInterval', browserWindow.clearInterval)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => storage.clear(),
      key: (index: number) => [...storage.keys()][index] ?? null,
      get length() { return storage.size },
    })
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce(firstId).mockReturnValue(secondId),
    })
  })

  afterEach(() => {
    for (const scope of scopes) scope.stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function settleRefresh(repository: Repository) {
    await Promise.all([
      repository.summary.mock.results.at(-1)!.value,
      repository.history.mock.results.at(-1)!.value,
    ])
    await nextTick()
  }

  async function mount(repository: () => Repository, identity: Ref<string> = ref('account-a')) {
    const scope = effectScope()
    scopes.push(scope)
    const sessions = scope.run(() => useTrainingSessions(identity, repository))!
    await settleRefresh(repository())
    expect(sessions.loading.value).toBe(false)
    return { scope, sessions, identity }
  }

  it('blocks a double tap while the first asynchronous insert is pending', async () => {
    const repository = createRepository()
    const insert = holdInsert(repository)
    const { sessions } = await mount(() => repository)

    const firstSave = sessions.log(trainingDate)
    const secondSave = sessions.log(trainingDate)
    const request = await insert.entered
    await secondSave

    expect(sessions.busy.value).toBe(true)
    expect(sessions.message.value).toBe('')
    expect(repository.insert).toHaveBeenCalledExactlyOnceWith(request)
    expect(repository.find).toHaveBeenCalledExactlyOnceWith(firstId)
    expect(crypto.randomUUID).toHaveBeenCalledOnce()

    insert.resolve(undefined)
    await firstSave

    expect(repository.insert).toHaveBeenCalledOnce()
    expect(sessions.busy.value).toBe(false)
    expect(sessions.pending.value).toBeNull()
    expect(storage.has(pendingKey('account-a'))).toBe(false)
    expect(sessions.message.value).toBe('Session logged.')
  })

  it('does not send or persist an insert while offline', async () => {
    const repository = createRepository()
    const { sessions } = await mount(() => repository)
    connection.onLine = false
    browserWindow.dispatchEvent(new Event('offline'))

    await sessions.log(trainingDate)

    expect(sessions.online.value).toBe(false)
    expect(repository.find).not.toHaveBeenCalled()
    expect(repository.insert).not.toHaveBeenCalled()
    expect(crypto.randomUUID).not.toHaveBeenCalled()
    expect(storage.size).toBe(0)
    expect(sessions.pending.value).toBeNull()
    expect(sessions.busy.value).toBe(false)
    expect(sessions.error.value).toBe('You are offline. No session was sent.')
  })

  it('retains an uncertain payload and manually retries by finding the same ID', async () => {
    const repository = createRepository()
    const insert = holdInsert(repository)
    const { sessions } = await mount(() => repository)
    const saving = sessions.log(trainingDate)
    const request = await insert.entered
    const persisted = JSON.stringify(request)

    expect(storage.get(pendingKey('account-a'))).toBe(persisted)
    insert.reject(new Error('Insert response lost'))
    await saving

    expect(sessions.pending.value).toEqual({ id: firstId, trained_on: trainingDate })
    expect(storage.get(pendingKey('account-a'))).toBe(persisted)
    expect(sessions.busy.value).toBe(false)
    expect(sessions.message.value).toBe('')
    expect(sessions.error.value).toBe('Save not confirmed. Retry checks the same entry; it will not log another session.')
    expect(repository.find.mock.calls).toEqual([[firstId], [firstId]])
    expect(repository.summary).toHaveBeenCalledOnce()

    repository.find.mockResolvedValueOnce(savedRow(request))
    await sessions.log('2020-02-03')

    expect(repository.find.mock.calls).toEqual([[firstId], [firstId], [firstId]])
    expect(repository.insert).toHaveBeenCalledExactlyOnceWith(request)
    expect(crypto.randomUUID).toHaveBeenCalledOnce()
    expect(sessions.pending.value).toBeNull()
    expect(storage.has(pendingKey('account-a'))).toBe(false)
    expect(sessions.error.value).toBe('')
    expect(sessions.message.value).toBe('Session logged.')
  })

  it('restores persisted pending state after scope recreation without inserting on reconnect', async () => {
    const repository = createRepository()
    repository.insert.mockRejectedValueOnce(new Error('Network'))
    const first = await mount(() => repository)
    await first.sessions.log(trainingDate)
    const request = first.sessions.pending.value!
    const persisted = storage.get(pendingKey('account-a'))
    first.scope.stop()
    expect(browserWindow.clearInterval).toHaveBeenCalledExactlyOnceWith(1)

    const restoredRepository = createRepository()
    const { sessions, scope } = await mount(() => restoredRepository)
    expect(sessions.pending.value).toEqual(request)
    expect(storage.get(pendingKey('account-a'))).toBe(persisted)

    connection.onLine = false
    browserWindow.dispatchEvent(new Event('offline'))
    connection.onLine = true
    browserWindow.dispatchEvent(new Event('online'))
    await settleRefresh(restoredRepository)

    expect(sessions.online.value).toBe(true)
    expect(sessions.loading.value).toBe(false)
    expect(sessions.pending.value).toEqual(request)
    expect(storage.get(pendingKey('account-a'))).toBe(persisted)
    expect(restoredRepository.summary).toHaveBeenCalledTimes(2)
    expect(restoredRepository.find).not.toHaveBeenCalled()
    expect(restoredRepository.insert).not.toHaveBeenCalled()
    expect(repository.summary).toHaveBeenCalledOnce()
    expect(repository.insert).toHaveBeenCalledOnce()

    scope.stop()
    browserWindow.dispatchEvent(new Event('online'))
    browserDocument.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(restoredRepository.summary).toHaveBeenCalledTimes(2)
    expect(browserWindow.clearInterval).toHaveBeenCalledTimes(2)
  })

  it('clears pending state on a definite 42501 rejection and preserves the visible error', async () => {
    const repository = createRepository()
    const insert = holdInsert(repository)
    const { sessions } = await mount(() => repository)
    const saving = sessions.log(trainingDate)
    await insert.entered

    expect(storage.has(pendingKey('account-a'))).toBe(true)
    insert.reject({ code: '42501', message: 'Permission denied' })
    await saving
    await nextTick()

    expect(sessions.pending.value).toBeNull()
    expect(storage.has(pendingKey('account-a'))).toBe(false)
    expect(sessions.busy.value).toBe(false)
    expect(sessions.message.value).toBe('')
    expect(sessions.error.value).toBe('The database rejected this entry. Check the date or ask the organizer to check permissions.')
    expect(repository.summary).toHaveBeenCalledOnce()
    expect(repository.history).toHaveBeenCalledOnce()
  })

  it('preserves delete failure and the currently visible history', async () => {
    const repository = createRepository()
    const row = savedRow({ id: firstId, trained_on: trainingDate })
    repository.history.mockResolvedValue([row])
    const deletion = deferred<void>()
    repository.remove.mockReturnValueOnce(deletion.promise)
    const { sessions } = await mount(() => repository)

    const removing = sessions.remove(row.id)
    expect(sessions.busy.value).toBe(true)
    deletion.reject(new Error('Delete response lost'))
    await removing
    await nextTick()

    expect(repository.remove).toHaveBeenCalledExactlyOnceWith(row.id)
    expect(sessions.busy.value).toBe(false)
    expect(sessions.history.value).toEqual([row])
    expect(sessions.summary.value).toEqual(stats)
    expect(sessions.message.value).toBe('')
    expect(sessions.error.value).toBe('Delete not confirmed. Refresh before trying again.')
    expect(repository.summary).toHaveBeenCalledOnce()
    expect(repository.history).toHaveBeenCalledOnce()
  })

  it('does not let an old in-flight save mutate the new account or its active save', async () => {
    const firstRepository = createRepository()
    const secondRepository = createRepository()
    const secondStats: Summary = { ...stats, month_count: 0, total_count: 0 }
    secondRepository.summary.mockResolvedValue(secondStats)
    const firstInsert = holdInsert(firstRepository)
    const secondInsert = holdInsert(secondRepository)
    const identity = ref('account-a')
    const { sessions } = await mount(
      () => identity.value === 'account-a' ? firstRepository : secondRepository,
      identity,
    )

    const firstSave = sessions.log(trainingDate)
    const firstRequest = await firstInsert.entered
    identity.value = 'account-b'
    await nextTick()
    await settleRefresh(secondRepository)

    expect(sessions.busy.value).toBe(false)
    expect(sessions.pending.value).toBeNull()
    expect(sessions.summary.value).toEqual(secondStats)
    expect(sessions.history.value).toEqual([])
    expect(sessions.message.value).toBe('')
    expect(sessions.error.value).toBe('')

    const secondSave = sessions.log(trainingDate)
    const secondRequest = await secondInsert.entered
    expect(secondRequest.id).toBe(secondId)
    firstInsert.resolve(undefined)
    await firstSave
    await nextTick()

    expect(sessions.busy.value).toBe(true)
    expect(sessions.pending.value).toEqual(secondRequest)
    expect(storage.get(pendingKey('account-a'))).toBe(JSON.stringify(firstRequest))
    expect(storage.get(pendingKey('account-b'))).toBe(JSON.stringify(secondRequest))
    expect(sessions.summary.value).toEqual(secondStats)
    expect(sessions.history.value).toEqual([])
    expect(sessions.message.value).toBe('')
    expect(sessions.error.value).toBe('')
    expect(firstRepository.summary).toHaveBeenCalledOnce()
    expect(secondRepository.summary).toHaveBeenCalledOnce()

    secondInsert.resolve(undefined)
    await secondSave
    expect(sessions.busy.value).toBe(false)
    expect(sessions.pending.value).toBeNull()
    expect(storage.has(pendingKey('account-b'))).toBe(false)
    expect(storage.get(pendingKey('account-a'))).toBe(JSON.stringify(firstRequest))
    expect(sessions.message.value).toBe('Session logged.')
  })
})
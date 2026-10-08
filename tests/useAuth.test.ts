// @vitest-environment node
import { effectScope } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  updateUser: vi.fn(),
  listener: null as null | ((event: string, session: { user: unknown } | null) => void),
}))
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (callback: typeof mocks.listener) => { mocks.listener = callback; return { data: { subscription: { unsubscribe() {} } } } },
      updateUser: mocks.updateUser,
    },
  },
}))

import { useAuth } from '../src/composables/useAuth'

const user = (metadata: Record<string, unknown>) => ({ id: 'u1', email: 'a@example.com', user_metadata: metadata })

function signedIn(metadata: Record<string, unknown>) {
  const scope = effectScope()
  const auth = scope.run(() => useAuth())!
  mocks.listener!('SIGNED_IN', { user: user(metadata) })
  return auth
}

describe('unlock state in the account metadata', () => {
  beforeEach(() => { mocks.updateUser.mockReset() })

  it('reads the unlock flag, name and last year\'s count from the metadata', () => {
    const auth = signedIn({ display_name: 'Max', last_year_count: 87, features_unlocked_at: '2026-10-07T10:00:00Z' })
    expect([auth.displayName.value, auth.lastYearCount.value, auth.featuresUnlocked.value]).toEqual(['Max', 87, true])
  })
  it('ignores invalid last-year values', () => {
    expect(signedIn({ display_name: 'Max', last_year_count: -3 }).lastYearCount.value).toBeNull()
    expect(signedIn({ display_name: 'Max', last_year_count: '12' }).lastYearCount.value).toBeNull()
  })
  it('stores the unlock and shows it afterwards', async () => {
    const auth = signedIn({ display_name: 'Max' })
    mocks.updateUser.mockResolvedValue({ data: { user: user({ display_name: 'Max', features_unlocked_at: 'now' }) }, error: null })
    await auth.unlockFeatures()
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { features_unlocked_at: expect.any(String) } })
    expect(auth.featuresUnlocked.value).toBe(true)
  })
  it('keeps the screens available on this device when saving the unlock fails', async () => {
    const auth = signedIn({ display_name: 'Max' })
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') })
    await auth.unlockFeatures()
    expect(auth.featuresUnlocked.value).toBe(true)
  })
  it('resets the unlock so the celebration can be replayed', async () => {
    const auth = signedIn({ display_name: 'Max', features_unlocked_at: '2026-10-07T10:00:00Z' })
    mocks.updateUser.mockResolvedValue({ data: { user: user({ display_name: 'Max', features_unlocked_at: null }) }, error: null })
    expect(await auth.relockFeatures()).toBe(true)
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { features_unlocked_at: null } })
    expect(auth.featuresUnlocked.value).toBe(false)
  })
  it('reports a failed reset and stays unlocked', async () => {
    const auth = signedIn({ display_name: 'Max', features_unlocked_at: '2026-10-07T10:00:00Z' })
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') })
    expect(await auth.relockFeatures()).toBe(false)
    expect(auth.featuresUnlocked.value).toBe(true)
  })
  it('saves last year\'s count whether the field hands over a number or text', async () => {
    const auth = signedIn({ display_name: 'Max' })
    mocks.updateUser.mockResolvedValue({ data: { user: user({ display_name: 'Max', last_year_count: 87 }) }, error: null })
    expect(await auth.setLastYearCount(87)).toBe(true)
    expect(await auth.setLastYearCount(' 87 ')).toBe(true)
    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, { data: { last_year_count: 87 } })
    expect(mocks.updateUser).toHaveBeenNthCalledWith(2, { data: { last_year_count: 87 } })
    expect(auth.lastYearCount.value).toBe(87)
  })
  it('clears last year\'s count when the field is empty', async () => {
    const auth = signedIn({ display_name: 'Max', last_year_count: 87 })
    mocks.updateUser.mockResolvedValue({ data: { user: user({ display_name: 'Max' }) }, error: null })
    expect(await auth.setLastYearCount('')).toBe(true)
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { last_year_count: null } })
    expect(auth.lastYearCount.value).toBeNull()
  })
  it('rejects counts that are not whole numbers from 0 to 10000, without calling the server', async () => {
    const auth = signedIn({ display_name: 'Max' })
    for (const input of ['8.5', -1, 'abc', 10001, 1e21]) expect(await auth.setLastYearCount(input)).toBe(false)
    expect(auth.error.value).toBe('Enter a whole number from 0 to 10000.')
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('reports a failed save of last year\'s count', async () => {
    const auth = signedIn({ display_name: 'Max' })
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: new Error('offline') })
    expect(await auth.setLastYearCount(50)).toBe(false)
    expect(auth.error.value).toContain('Could not save')
  })
  it('saves the name and keeps the other metadata', async () => {
    const auth = signedIn({ display_name: 'Max', last_year_count: 87 })
    mocks.updateUser.mockResolvedValue({ data: { user: user({ display_name: 'Maxi', last_year_count: 87 }) }, error: null })
    expect(await auth.setName('  Maxi ')).toBe(true)
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { display_name: 'Maxi' } })
    expect([auth.displayName.value, auth.lastYearCount.value]).toEqual(['Maxi', 87])
  })
  it('does not call the server when there is nothing to reset', async () => {
    const auth = signedIn({ display_name: 'Max' })
    expect(await auth.relockFeatures()).toBe(true)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
})

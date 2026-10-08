import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useClipboard } from '../src/composables/useClipboard'

afterEach(() => vi.unstubAllGlobals())

describe('clipboard feedback', () => {
  it('writes immediately and reports success only after confirmation', async () => {
    let resolve!: () => void
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const scope = effectScope()
    const clipboard = scope.run(() => useClipboard(ref('leaderboard')))!
    const pending = clipboard.copy('| Name |', 'Leaderboard')
    expect(writeText).toHaveBeenCalledWith('| Name |')
    expect(clipboard.message.value).toBe('')
    expect(clipboard.copying.value).toBe(true)
    await clipboard.copy('duplicate', 'Leaderboard')
    expect(writeText).toHaveBeenCalledTimes(1)
    resolve()
    await pending
    expect(clipboard.message.value).toBe('Leaderboard copied.')
    expect(clipboard.copying.value).toBe(false)
    scope.stop()
  })

  it.each([false, true])('handles unavailable or denied clipboard access (denied=%s)', async (denied) => {
    vi.stubGlobal('navigator', denied ? { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } } : {})
    const scope = effectScope()
    const clipboard = scope.run(() => useClipboard(ref('league')))!
    await clipboard.copy('table', 'League')
    expect(clipboard.error.value).toMatch(/Could not copy/)
    expect(clipboard.message.value).toBe('')
    expect(clipboard.copying.value).toBe(false)
    scope.stop()
  })

  it('clears feedback and ignores late results after the context changes', async () => {
    let resolve!: () => void
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => new Promise<void>((done) => { resolve = done })) } })
    const context = ref('account-a:leaderboard')
    const scope = effectScope()
    const clipboard = scope.run(() => useClipboard(context))!
    const pending = clipboard.copy('table', 'Leaderboard')
    context.value = 'account-b:league'
    expect(clipboard.copying.value).toBe(false)
    resolve()
    await pending
    expect(clipboard.message.value).toBe('')
    expect(clipboard.error.value).toBe('')
    scope.stop()
  })
})
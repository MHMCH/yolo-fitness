import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionSound } from '../src/composables/useSessionSound'

describe('session confirmation audio', () => {
  let scope: ReturnType<typeof effectScope>
  const start = vi.fn()
  const stop = vi.fn()
  const resume = vi.fn()
  const close = vi.fn()
  const decode = vi.fn()
  const fetchAudio = vi.fn()
  const storage = new Map<string, string>()
  let state = 'running'

  beforeEach(() => {
    vi.resetAllMocks()
    storage.clear()
    state = 'running'
    resume.mockResolvedValue(undefined)
    close.mockResolvedValue(undefined)
    decode.mockResolvedValue({ duration: 0.5 })
    fetchAudio.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    vi.stubGlobal('fetch', fetchAudio)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    vi.stubGlobal('AudioContext', class {
      destination = {}
      get state() { return state }
      resume = resume
      close = close
      decodeAudioData = decode
      createBufferSource() { return { buffer: null, connect: vi.fn(), start, stop } }
    })
    scope = effectScope()
  })
  afterEach(() => { scope.stop(); vi.unstubAllGlobals() })
  const sound = () => scope.run(() => useSessionSound())!

  it('unlocks on prepare but plays only on explicit confirmation', async () => {
    const audio = sound()
    audio.prepare()
    expect(resume).toHaveBeenCalledOnce()
    expect(start).not.toHaveBeenCalled()
    await audio.play()
    expect(start).toHaveBeenCalledOnce()
    expect(fetchAudio).toHaveBeenCalledWith('/session-logged.mp3')
  })
  it('remembers disabled sound and skips loading', async () => {
    storage.set('yolo-fitness:sound-enabled', 'false')
    const audio = sound()
    audio.prepare()
    await audio.play()
    expect(fetchAudio).not.toHaveBeenCalled()
    audio.setEnabled(true)
    expect(storage.get('yolo-fitness:sound-enabled')).toBe('true')
  })
  it('does not play if disabled while a save is pending', async () => {
    const audio = sound()
    audio.prepare()
    audio.setEnabled(false)
    await audio.play()
    expect(start).not.toHaveBeenCalled()
  })
  it('absorbs download failures and allows later retry', async () => {
    fetchAudio.mockRejectedValueOnce(new Error('Offline'))
    const audio = sound()
    audio.prepare()
    await expect(audio.play()).resolves.toBeUndefined()
    audio.prepare()
    await audio.play()
    expect(start).toHaveBeenCalledOnce()
  })
  it('absorbs browser autoplay restrictions', async () => {
    state = 'suspended'
    resume.mockRejectedValue(new Error('NotAllowed'))
    const audio = sound()
    audio.prepare()
    await expect(audio.play()).resolves.toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })
  it('stops and closes audio on disposal', async () => {
    const audio = sound()
    audio.prepare()
    await audio.play()
    scope.stop()
    expect(stop).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    await audio.play()
    expect(start).toHaveBeenCalledOnce()
  })
})
import { onScopeDispose, ref } from 'vue'

const preferenceKey = 'yolo-fitness:sound-enabled'

export function useSessionSound() {
  const enabled = ref(true)
  try { enabled.value = localStorage.getItem(preferenceKey) !== 'false' } catch {}
  let context: AudioContext | null = null
  let decoded: Promise<AudioBuffer | null> | null = null
  let source: AudioBufferSourceNode | null = null
  let disposed = false

  function prepare() {
    if (!enabled.value || disposed) return
    try {
      context ??= new AudioContext()
      const activeContext = context
      void activeContext.resume().catch(() => {})
      decoded ??= fetch(`${import.meta.env.BASE_URL}session-logged.mp3`)
        .then((response) => {
          if (!response.ok) throw new Error('Audio unavailable')
          return response.arrayBuffer()
        })
        .then((bytes) => activeContext.decodeAudioData(bytes))
        .catch(() => { decoded = null; return null })
    } catch {}
  }

  async function play() {
    if (!enabled.value || disposed || !context || !decoded) return
    try {
      const buffer = await decoded
      if (!buffer || !enabled.value || disposed || context.state !== 'running') return
      source?.stop()
      source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)
      source.start()
    } catch {}
  }

  function setEnabled(value: boolean) {
    enabled.value = value
    try { localStorage.setItem(preferenceKey, String(value)) } catch {}
    if (!value) { try { source?.stop() } catch {} }
  }

  onScopeDispose(() => {
    disposed = true
    try { source?.stop(); void context?.close().catch(() => {}) } catch {}
  })
  return { enabled, prepare, play, setEnabled }
}
import { ref, watch, type Ref } from 'vue'

export function useClipboard(context: Ref<string>) {
  const copying = ref(false)
  const message = ref('')
  const error = ref('')
  let generation = 0
  watch(context, () => {
    generation++
    copying.value = false
    message.value = ''
    error.value = ''
  }, { flush: 'sync' })

  async function copy(text: string, label: string) {
    if (copying.value) return
    const current = ++generation
    copying.value = true
    message.value = ''
    error.value = ''
    try {
      await navigator.clipboard.writeText(text)
      if (current === generation) message.value = `${label} copied.`
    } catch {
      if (current === generation) error.value = 'Could not copy. Check clipboard access in your browser and try again.'
    } finally {
      if (current === generation) copying.value = false
    }
  }

  return { copying, message, error, copy }
}
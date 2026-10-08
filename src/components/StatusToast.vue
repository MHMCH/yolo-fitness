<script setup lang="ts">
import { Check, X } from '@lucide/vue'

defineProps<{ message: string; error: string; notice: string; pending: boolean; busy: boolean }>()
defineEmits<{ retry: []; refresh: []; dismiss: [] }>()
</script>

<template>
  <div class="toast-region">
    <div v-if="error" class="toast toast-error" role="alert">
      <span class="toast-text">{{ error }}</span>
      <button v-if="pending" class="toast-action" :disabled="busy" @click="$emit('retry')">Retry</button>
      <button v-else class="toast-action" :disabled="busy" @click="$emit('refresh')">Refresh</button>
      <button class="toast-close" aria-label="Dismiss" title="Dismiss" @click="$emit('dismiss')"><X :size="16" /></button>
    </div>
    <div v-else-if="notice" class="toast toast-error" role="alert"><span class="toast-text">{{ notice }}</span></div>
    <div v-else-if="message" class="toast toast-success" role="status"><Check :size="16" /><span class="toast-text">{{ message }}</span></div>
  </div>
</template>

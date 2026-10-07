<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, Check, LoaderCircle, Minus, Plus, RefreshCw, Shuffle, Undo2 } from '@lucide/vue'
import type { useTeamAdmin } from '../composables/useTeamAdmin'
import { monthRange, quarterLabel, teamColor } from '../lib/teams'
import type { Season } from '../types/database'

const props = defineProps<{ season: Season | null; today: string; admin: ReturnType<typeof useTeamAdmin> }>()
defineEmits<{ back: [] }>()

const slots = computed(() => Array.from({ length: props.admin.teamCount.value }, (_, index) => index + 1))
const started = computed(() => props.season ? monthRange(props.season.starts_on, props.admin.quarter.value, 1).lo <= props.today : false)
const membersOf = (slot: number) => props.admin.people.value.filter((person) => props.admin.assignment.value[person.id] === slot).map((person) => person.name)
const chip = (id: string) => {
  const slot = props.admin.assignment.value[id]
  return slot ? teamColor(slot) : '#44464e'
}
function choose(id: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  props.admin.assign(id, value ? Number(value) : null)
}
async function save() {
  if (started.value && !window.confirm(`Quarter ${props.admin.quarter.value} has already started. Changing the teams recalculates its standings for everyone. Save anyway?`)) return
  await props.admin.save()
}
</script>

<template>
  <div class="view-heading">
    <button class="icon-button" title="Back" aria-label="Back" @click="$emit('back')"><ArrowLeft :size="22" /></button>
    <div class="heading-text"><p class="eyebrow">ADMIN</p><h1>Teams.</h1></div>
  </div>
  <p v-if="!season" class="empty muted">There is no active season right now.</p>
  <template v-else>
    <div class="pill-row" role="tablist" aria-label="Quarter">
      <button v-for="number in 4" :key="number" class="pill" role="tab" :class="{ selected: admin.quarter.value === number }" :aria-selected="admin.quarter.value === number"
        :disabled="admin.saving.value" @click="admin.quarter.value = number"><strong>Q{{ number }}</strong><span>{{ quarterLabel(season.starts_on, number) }}</span></button>
    </div>
    <p v-if="started" class="feedback muted admin-warning">This quarter has already started. Changes recalculate its standings.</p>

    <p v-if="admin.loading.value && !admin.people.value.length" class="empty muted"><LoaderCircle class="spin" :size="20" aria-label="Loading" /></p>
    <template v-else-if="admin.people.value.length">
      <div class="admin-toolbar">
        <div class="stepper" role="group" aria-label="Number of teams">
          <button class="icon-button" aria-label="Fewer teams" title="Fewer teams" :disabled="admin.teamCount.value <= 1 || admin.highestUsed.value >= admin.teamCount.value" @click="admin.removeTeam()"><Minus :size="18" /></button>
          <span>{{ admin.teamCount.value }} teams</span>
          <button class="icon-button" aria-label="More teams" title="More teams" :disabled="admin.teamCount.value >= 8" @click="admin.addTeam()"><Plus :size="18" /></button>
        </div>
        <button class="secondary" :disabled="admin.saving.value" @click="admin.draw()"><Shuffle :size="16" /> Draw randomly</button>
        <button class="secondary" :disabled="admin.saving.value || !admin.dirty.value" @click="admin.revert()"><Undo2 :size="16" /> Undo</button>
      </div>

      <ul class="admin-people">
        <li v-for="person in admin.people.value" :key="person.id">
          <span class="team-chip" :style="{ background: chip(person.id) }"></span>
          <label class="admin-name" :for="`team-${person.id}`">{{ person.name }}</label>
          <select :id="`team-${person.id}`" :value="admin.assignment.value[person.id] ?? ''" :disabled="admin.saving.value" @change="choose(person.id, $event)">
            <option value="">Unassigned</option>
            <option v-for="slot in slots" :key="slot" :value="slot">Team {{ slot }}</option>
          </select>
        </li>
      </ul>

      <h2 class="admin-subtitle">Teams</h2>
      <ol class="team-list admin-teams">
        <li v-for="slot in slots" :key="slot">
          <span class="rank-place">{{ slot }}</span>
          <span class="team-chip" :style="{ background: teamColor(slot) }"></span>
          <span class="team-names">{{ membersOf(slot).join(' + ') || 'Empty' }}</span>
          <span class="muted small">{{ membersOf(slot).length }}</span>
        </li>
      </ol>

      <p v-if="admin.check.value.unassigned" class="feedback error">{{ admin.check.value.unassigned }} {{ admin.check.value.unassigned === 1 ? 'person is' : 'people are' }} not in a team yet.</p>
      <p v-if="admin.check.value.empty.length" class="feedback error">Team {{ admin.check.value.empty.join(', ') }} {{ admin.check.value.empty.length === 1 ? 'is' : 'are' }} empty. Remove it or add someone.</p>
      <p v-if="admin.check.value.oddSize.length" class="feedback muted">Team {{ admin.check.value.oddSize.join(', ') }} {{ admin.check.value.oddSize.length === 1 ? 'does' : 'do' }} not have 2 or 3 members.</p>

      <button class="primary admin-save" :disabled="admin.saving.value || !admin.check.value.ok || !admin.dirty.value" @click="save">
        <LoaderCircle v-if="admin.saving.value" class="spin" :size="18" /><Check v-else :size="18" /> Save teams
      </button>
    </template>
    <p v-if="admin.message.value" class="feedback success"><Check :size="16" /> {{ admin.message.value }}</p>
    <p v-if="admin.error.value" class="feedback error" role="alert">{{ admin.error.value }}</p>
    <button v-if="admin.error.value && !admin.people.value.length" class="secondary" :disabled="admin.loading.value" @click="admin.reload()"><RefreshCw :size="16" /> Try again</button>
  </template>
</template>

import { computed, ref, watch, type Ref } from 'vue'
import { teamAdminRepository, type AdminPerson, type TeamAdminRepository } from '../lib/teamAdminRepository'
import { checkAssignment, defaultTeamCount, drawTeams, MAX_TEAMS, toTeamLists, type Assignment } from '../lib/teamDraw'
import type { Season } from '../types/database'

/** Edit a quarter's teams (administrators only; the database enforces that). */
export function useTeamAdmin(identity: Ref<string>, active: Ref<boolean>, season: Ref<Season | null>,
  repository: () => TeamAdminRepository = () => teamAdminRepository) {
  const quarter = ref(1)
  const people = ref<AdminPerson[]>([])
  const assignment = ref<Assignment>({})
  const saved = ref<Assignment>({})
  const teamCount = ref(1)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const message = ref('')
  let sequence = 0

  const userIds = computed(() => people.value.map((person) => person.id))
  const check = computed(() => checkAssignment(assignment.value, userIds.value, teamCount.value))
  const normalized = (value: Assignment) => JSON.stringify(userIds.value.map((id) => value[id] ?? null))
  const dirty = computed(() => normalized(assignment.value) !== normalized(saved.value))
  const highestUsed = computed(() => Math.max(0, ...Object.values(assignment.value).map((slot) => slot ?? 0)))

  async function load() {
    const current = ++sequence
    if (!identity.value || !season.value) return
    loading.value = true
    error.value = ''
    message.value = ''
    try {
      const [list, existing] = await Promise.all([repository().people(), repository().assignments(season.value, quarter.value)])
      if (current !== sequence) return
      people.value = list
      assignment.value = { ...existing }
      saved.value = { ...existing }
      teamCount.value = Math.max(defaultTeamCount(list.length), Math.max(0, ...Object.values(existing).map((slot) => slot ?? 0)))
    } catch {
      if (current === sequence) error.value = 'Could not load the teams. Check your connection and try again.'
    } finally { if (current === sequence) loading.value = false }
  }
  function assign(userId: string, slot: number | null) { assignment.value = { ...assignment.value, [userId]: slot }; message.value = '' }
  function draw() { assignment.value = drawTeams(userIds.value, teamCount.value); message.value = '' }
  function addTeam() { if (teamCount.value < MAX_TEAMS) teamCount.value++ }
  function removeTeam() { if (teamCount.value > 1 && highestUsed.value < teamCount.value) teamCount.value-- }
  function revert() { assignment.value = { ...saved.value }; message.value = ''; error.value = '' }
  async function save() {
    if (saving.value || !check.value.ok) return false
    saving.value = true
    error.value = ''
    message.value = ''
    try {
      await repository().save(quarter.value, toTeamLists(assignment.value, teamCount.value))
      message.value = 'Teams saved.'
      saving.value = false
      await load()
      message.value = 'Teams saved.'
      return true
    } catch (failure) {
      const code = (failure as { code?: string })?.code
      error.value = code === '42501' ? 'Only administrators can change teams.'
        : code === '23505' ? 'Someone is listed twice. Reload and try again.'
        : 'Could not save the teams. Check your connection and try again.'
      return false
    } finally { saving.value = false }
  }

  watch(identity, () => { sequence++; people.value = []; assignment.value = {}; saved.value = {}; error.value = ''; message.value = ''; loading.value = false })
  watch([identity, active, season, quarter], () => { if (active.value) void load() }, { immediate: true })
  return { quarter, people, assignment, teamCount, loading, saving, error, message, check, dirty, highestUsed, assign, draw, addTeam, removeTeam, revert, save, reload: load }
}

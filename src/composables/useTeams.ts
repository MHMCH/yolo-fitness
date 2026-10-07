import { ref, watch, type Ref } from 'vue'
import { teamsRepository, type TeamsRepository } from '../lib/teamsRepository'
import { currentSelection } from '../lib/teams'
import type { Season, TeamDaily, TeamMonthRow, TeamQuarterRow } from '../types/database'

export type MonthTab = 1 | 2 | 3 | 'total'

/** Team standings for the selected quarter and month (or the quarter total) while the Teams view is open. */
export function useTeams(identity: Ref<string>, active: Ref<boolean>, refreshKey: Ref<unknown>, season: Ref<Season | null>, today: Ref<string>,
  repository: () => TeamsRepository = () => teamsRepository) {
  const quarter = ref(1)
  const month = ref<MonthTab>(1)
  const monthRows = ref<TeamMonthRow[]>([])
  const daily = ref<TeamDaily[]>([])
  const quarterRows = ref<TeamQuarterRow[]>([])
  const loading = ref(false)
  const error = ref('')
  let initialized = false
  let sequence = 0

  function clear() { monthRows.value = []; daily.value = []; quarterRows.value = [] }
  async function load() {
    const current = ++sequence
    if (!identity.value || !season.value) { clear(); loading.value = false; return }
    loading.value = true
    error.value = ''
    const selectedQuarter = quarter.value
    const selectedMonth = month.value
    try {
      if (selectedMonth === 'total') {
        const rows = await repository().quarter(selectedQuarter)
        if (current !== sequence) return
        quarterRows.value = rows
        monthRows.value = []
        daily.value = []
      } else {
        const [rows, series] = await Promise.all([repository().month(selectedQuarter, selectedMonth), repository().daily(selectedQuarter, selectedMonth)])
        if (current !== sequence) return
        monthRows.value = rows
        daily.value = series
        quarterRows.value = []
      }
    } catch {
      if (current === sequence) error.value = 'Could not load the teams. Check your connection and try again.'
    } finally { if (current === sequence) loading.value = false }
  }
  watch(identity, () => { sequence++; initialized = false; clear(); error.value = ''; loading.value = false })
  watch([identity, active, refreshKey, season, quarter, month], () => {
    if (!active.value || !season.value) return
    if (!initialized) {
      initialized = true
      const selection = currentSelection(season.value.starts_on, today.value)
      if (selection && (selection.quarter !== quarter.value || selection.month !== month.value)) {
        quarter.value = selection.quarter
        month.value = selection.month
        return   // the selection change re-triggers this watcher
      }
    }
    void load()
  }, { immediate: true })
  return { quarter, month, monthRows, daily, quarterRows, loading, error, reload: load }
}

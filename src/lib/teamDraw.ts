/** Who is in which team: user id -> team slot (1-based), or null when not yet assigned. */
export type Assignment = Record<string, number | null>

export const MAX_TEAMS = 8

/** Team sizes as even as possible, larger teams first: 11 people in 5 teams -> 3, 2, 2, 2, 2. */
export function teamSizes(people: number, teams: number): number[] {
  const base = Math.floor(people / teams)
  const extra = people % teams
  return Array.from({ length: teams }, (_, index) => base + (index < extra ? 1 : 0))
}

/** The sensible default number of teams: pairs, with a trio absorbing an odd person. */
export const defaultTeamCount = (people: number) => Math.min(MAX_TEAMS, Math.max(1, Math.floor(people / 2)))

/** Shuffle everyone into `teams` teams of even size. `random` returns a number in [0, 1). */
export function drawTeams(userIds: string[], teams: number, random: () => number = Math.random): Assignment {
  const shuffled = [...userIds]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  const assignment: Assignment = {}
  let cursor = 0
  teamSizes(shuffled.length, teams).forEach((size, index) => {
    for (const id of shuffled.slice(cursor, cursor + size)) assignment[id] = index + 1
    cursor += size
  })
  return assignment
}

/** Member lists in slot order, skipping empty teams (the database slot is the position in this list). */
export function toTeamLists(assignment: Assignment, teams: number): string[][] {
  return Array.from({ length: teams }, (_, index) => Object.entries(assignment)
    .filter(([, slot]) => slot === index + 1).map(([id]) => id))
    .filter((members) => members.length > 0)
}

export type AssignmentCheck = {
  unassigned: number
  /** Slots (1-based) without any member. */
  empty: number[]
  /** Slots whose size is not 2 or 3. */
  oddSize: number[]
  /** The assignment can be saved: everyone is placed and no team is empty. */
  ok: boolean
}

export function checkAssignment(assignment: Assignment, userIds: string[], teams: number): AssignmentCheck {
  const sizes = new Array<number>(teams).fill(0)
  let unassigned = 0
  for (const id of userIds) {
    const slot = assignment[id]
    if (slot && slot >= 1 && slot <= teams) sizes[slot - 1]++
    else unassigned++
  }
  const empty = sizes.flatMap((size, index) => size === 0 ? [index + 1] : [])
  const oddSize = sizes.flatMap((size, index) => size > 0 && (size < 2 || size > 3) ? [index + 1] : [])
  return { unassigned, empty, oddSize, ok: userIds.length > 0 && unassigned === 0 && empty.length === 0 }
}

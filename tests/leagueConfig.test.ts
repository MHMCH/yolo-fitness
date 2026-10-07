import { describe, expect, it } from 'vitest'
import { league } from '../src/config/league'
import { seasonStart } from '../src/config/season'
import { addMonths } from '../src/lib/seasonChart'
import { quarterBounds } from '../src/lib/trainingDates'

// Guards the production configuration: a wrong or placeholder id would silently put a person in the wrong team.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const keys = Object.keys(league).sort()
const people = (key: string) => league[key].flat()

describe('league configuration (src/config)', () => {
  it('has teams for exactly the four quarters of the season', () => {
    const expected = [0, 3, 6, 9].map((months) => quarterBounds(addMonths(seasonStart, months)).key)
    expect(keys).toEqual(expected)
  })
  it('lists account ids, never emails or placeholders', () => {
    for (const key of keys) {
      for (const id of people(key)) expect(id, `${key}: ${id}`).toMatch(uuid)
    }
  })
  it('puts every person in exactly one team per quarter', () => {
    for (const key of keys) {
      const members = people(key)
      expect(new Set(members).size, `${key} lists someone twice`).toBe(members.length)
    }
  })
  it('has the same people in every quarter', () => {
    const first = [...people(keys[0])].sort()
    expect(first.length).toBeGreaterThan(1)
    for (const key of keys) expect([...people(key)].sort(), key).toEqual(first)
  })
  it('uses teams of two or three', () => {
    for (const key of keys) {
      for (const team of league[key]) expect(team.length, `${key}: ${team.length} members`).toBeGreaterThanOrEqual(2)
      for (const team of league[key]) expect(team.length).toBeLessThanOrEqual(3)
    }
  })
})

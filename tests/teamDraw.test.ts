import { describe, expect, it } from 'vitest'
import { checkAssignment, defaultTeamCount, drawTeams, teamSizes, toTeamLists } from '../src/lib/teamDraw'

const ids = Array.from({ length: 11 }, (_, index) => `u${index + 1}`)
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

describe('team draw', () => {
  it('splits people as evenly as possible with the larger teams first', () => {
    expect(teamSizes(11, 5)).toEqual([3, 2, 2, 2, 2])
    expect(teamSizes(10, 5)).toEqual([2, 2, 2, 2, 2])
    expect(teamSizes(7, 3)).toEqual([3, 2, 2])
  })
  it('defaults to pairs', () => {
    expect(defaultTeamCount(11)).toBe(5)
    expect(defaultTeamCount(1)).toBe(1)
    expect(defaultTeamCount(40)).toBe(8)
  })
  it('places everyone exactly once, in teams of 2 and one trio for eleven people', () => {
    const assignment = drawTeams(ids, 5, seeded(1))
    expect(Object.keys(assignment).sort()).toEqual([...ids].sort())
    const sizes = [1, 2, 3, 4, 5].map((slot) => Object.values(assignment).filter((value) => value === slot).length)
    expect(sizes).toEqual([3, 2, 2, 2, 2])
  })
  it('shuffles differently for different random sources', () => {
    expect(drawTeams(ids, 5, seeded(1))).not.toEqual(drawTeams(ids, 5, seeded(2)))
  })
  it('does not change the list it was given', () => {
    const copy = [...ids]
    drawTeams(ids, 5, seeded(3))
    expect(ids).toEqual(copy)
  })
})

describe('assignment helpers', () => {
  it('lists members per team in slot order and drops empty teams', () => {
    expect(toTeamLists({ a: 2, b: 1, c: 2, d: null }, 3)).toEqual([['b'], ['a', 'c']])
  })
  it('accepts a complete assignment', () => {
    expect(checkAssignment(drawTeams(ids, 5, seeded(4)), ids, 5)).toEqual({ unassigned: 0, empty: [], oddSize: [], ok: true })
  })
  it('reports unassigned people, empty teams and odd sizes', () => {
    const check = checkAssignment({ a: 1, b: 1, c: 1, d: 1, e: null }, ['a', 'b', 'c', 'd', 'e'], 2)
    expect(check).toEqual({ unassigned: 1, empty: [2], oddSize: [1], ok: false })
  })
  it('allows odd team sizes but not unassigned people', () => {
    expect(checkAssignment({ a: 1, b: 2 }, ['a', 'b'], 2)).toMatchObject({ oddSize: [1, 2], ok: true })
    expect(checkAssignment({}, [], 1).ok).toBe(false)
  })
  it('ignores slots beyond the team count', () => {
    expect(checkAssignment({ a: 4 }, ['a'], 2).unassigned).toBe(1)
  })
})

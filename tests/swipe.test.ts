import { describe, expect, it } from 'vitest'
import { neighbour, swipeDirection } from '../src/lib/swipe'

const from = (x: number, y = 400) => ({ x, y })

describe('swipe detection', () => {
  it('recognises a clear horizontal swipe in both directions', () => {
    expect(swipeDirection(from(300), from(150, 410), 375)).toBe('left')
    expect(swipeDirection(from(100), from(260, 390), 375)).toBe('right')
  })
  it('ignores short moves and mostly vertical moves', () => {
    expect(swipeDirection(from(200), from(160), 375)).toBeNull()
    expect(swipeDirection(from(200, 300), from(100, 500), 375)).toBeNull()
    expect(swipeDirection(from(200, 300), from(130, 380), 375)).toBeNull()
  })
  it('ignores swipes that start at a screen edge', () => {
    expect(swipeDirection(from(10), from(200), 375)).toBeNull()
    expect(swipeDirection(from(360), from(150), 375)).toBeNull()
    expect(swipeDirection(from(30), from(200), 375)).toBe('right')
  })
})

describe('neighbouring tab', () => {
  const tabs = ['home', 'leaderboard', 'league', 'account']
  it('moves to the next tab when the finger moves left and to the previous one when it moves right', () => {
    expect(neighbour(tabs, 'leaderboard', 'left')).toBe('league')
    expect(neighbour(tabs, 'leaderboard', 'right')).toBe('home')
  })
  it('stops at both ends and for unknown tabs', () => {
    expect(neighbour(tabs, 'home', 'right')).toBeNull()
    expect(neighbour(tabs, 'account', 'left')).toBeNull()
    expect(neighbour(tabs, 'history', 'left')).toBeNull()
  })
  it('works with the shorter list while the new features are hidden', () => {
    expect(neighbour(['home', 'account'], 'home', 'left')).toBe('account')
  })
})

export type Point = { x: number; y: number }
export type SwipeDirection = 'left' | 'right'

/**
 * Whether a touch from `start` to `end` is a deliberate horizontal swipe: far enough, clearly more horizontal than
 * vertical, and not starting at a screen edge (where phones use swipes for "back"). 'left' means the finger moved
 * left, which goes to the next tab.
 */
export function swipeDirection(start: Point, end: Point, screenWidth: number, minDistance = 64, ratio = 1.6, edge = 24): SwipeDirection | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dx) < minDistance || Math.abs(dx) < Math.abs(dy) * ratio) return null
  if (start.x < edge || start.x > screenWidth - edge) return null
  return dx < 0 ? 'left' : 'right'
}

/** The tab after (moving left) or before (moving right) `current`, or null at the ends. */
export function neighbour<Tab>(order: Tab[], current: Tab, direction: SwipeDirection): Tab | null {
  const index = order.indexOf(current)
  if (index < 0) return null
  return order[index + (direction === 'left' ? 1 : -1)] ?? null
}

/** Places where a swipe must keep its normal meaning: the charts' value tooltip, form fields, the date form. */
export const NO_SWIPE_SELECTOR = '.chart, input, select, textarea, .date-form, .tabs, .toast, [data-no-swipe]'

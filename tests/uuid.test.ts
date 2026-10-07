import { webcrypto } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from '../src/lib/uuid'

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('uses the browser function where it exists', () => {
    expect(newId()).toMatch(uuidV4)
  })
  it('falls back to random values on pages without crypto.randomUUID (plain http)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (array: Uint8Array<ArrayBuffer>) => webcrypto.getRandomValues(array) })
    const ids = Array.from({ length: 50 }, () => newId())
    for (const id of ids) expect(id).toMatch(uuidV4)
    expect(new Set(ids).size).toBe(50)
  })
})

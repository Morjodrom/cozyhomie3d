import { describe, expect, it } from 'vitest'
import { DEFAULT_POT } from './design'
import { LEGACY_SESSION_KEY, loadSession, saveSession, SESSION_KEY } from './persistence'

describe('session persistence', () => {
  it('round-trips a valid v2 design', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    saveSession(storage, DEFAULT_POT)
    expect(loadSession(storage)).toEqual(DEFAULT_POT)
  })

  it('ignores corrupt data and never reads the legacy v1 key', () => {
    const values = new Map([[LEGACY_SESSION_KEY, JSON.stringify({ schemaVersion: 1 })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null }
    expect(loadSession(storage)).toBeNull()
    expect(values.has(LEGACY_SESSION_KEY)).toBe(true)
  })

  it('ignores corrupt v2 data', () => {
    const storage = { getItem: () => '{bad json' }
    expect(loadSession(storage)).toBeNull()
  })

  it('uses an isolated v2 key', () => { expect(SESSION_KEY).toBe('drawer-generator:session:v2') })
})

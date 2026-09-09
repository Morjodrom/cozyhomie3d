import { describe, expect, it } from 'vitest'
import { DEFAULT_POT } from './design'
import { loadSession, saveSession, SESSION_KEY } from './persistence'

describe('session persistence', () => {
  it('round-trips a valid design', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    saveSession(storage, DEFAULT_POT)

    expect(loadSession(storage)).toEqual(DEFAULT_POT)
  })

  it('ignores corrupt data', () => {
    const storage = { getItem: () => '{bad json' }

    expect(loadSession(storage)).toBeNull()
  })

  it('uses the versioned key', () => {
    expect(SESSION_KEY).toBe('drawer-generator:session:v1')
  })
})

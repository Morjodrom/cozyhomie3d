import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAWER, DEFAULT_POT } from './design'
import { LEGACY_SESSION_KEY, loadSession, saveSession, SESSION_KEY, SESSION_VERSION } from './persistence'

describe('session persistence', () => {
  it('round-trips a complete session', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const session = { config: DEFAULT_POT, highFidelityPreview: true }
    saveSession(storage, session)
    expect(loadSession(storage)).toEqual(session)
  })

  it('ignores corrupt data and never reads the legacy v4 key', () => {
    const values = new Map([[LEGACY_SESSION_KEY, JSON.stringify({ schemaVersion: 4 })]])
    const storage = { getItem: (key: string) => values.get(key) ?? null }
    expect(loadSession(storage)).toBeNull()
    expect(values.has(LEGACY_SESSION_KEY)).toBe(true)
  })

  it('ignores corrupt v5 data', () => {
    const storage = { getItem: () => '{bad json' }
    expect(loadSession(storage)).toBeNull()
  })

  it('restores drawer texture wall selections', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const session = { config: { ...DEFAULT_DRAWER, textureWalls: { front: true, sides: false, back: false } }, highFidelityPreview: false }
    saveSession(storage, session)
    expect(loadSession(storage)).toEqual(session)
  })

  it('loads the original bare v5 config with high fidelity disabled', () => {
    const values = new Map([[SESSION_KEY, JSON.stringify(DEFAULT_POT)]])
    expect(loadSession({ getItem: (key: string) => values.get(key) ?? null })).toEqual({ config: DEFAULT_POT, highFidelityPreview: false })
  })

  it('ignores unsupported session envelopes', () => {
    const storage = { getItem: () => JSON.stringify({ sessionVersion: 99, config: DEFAULT_POT, highFidelityPreview: true }) }
    expect(loadSession(storage)).toBeNull()
  })

  it('uses the current session contract', () => {
    expect(SESSION_KEY).toBe('drawer-generator:session:v5')
    expect(SESSION_VERSION).toBe(1)
  })
})

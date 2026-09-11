import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY } from './design'
import { loadSession, saveSession, SESSION_KEY } from './persistence'

describe('session persistence', () => {
  it('round-trips a complete session', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const session = { config: DEFAULT_POT, highFidelityPreview: true }
    saveSession(storage, session)
    expect(loadSession(storage)).toEqual(session)
  })

  it('ignores corrupt data', () => {
    const storage = { getItem: () => '{bad json' }
    expect(loadSession(storage)).toBeNull()
  })

  it('rejects v9 sessions instead of migrating the missing preview gap', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const { previewGapMm: _previewGapMm, ...tray } = DEFAULT_POT_WITH_TRAY.tray
    const value = JSON.stringify({ config: { ...DEFAULT_POT_WITH_TRAY, schemaVersion: 9, tray }, highFidelityPreview: false })
    expect(loadSession({ getItem: () => value })).toBeNull()
  })

  it('restores drawer texture wall selections', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const session = { config: { ...DEFAULT_DRAWER, textureWalls: { front: true, sides: false, back: false } }, highFidelityPreview: false }
    saveSession(storage, session)
    expect(loadSession(storage)).toEqual(session)
  })

  it('restores pot-with-tray settings without a schema migration', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }
    const session = { config: { ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, heightMm: 24 } }, highFidelityPreview: false }

    saveSession(storage, session)

    expect(loadSession(storage)).toEqual(session)
  })

  it('rejects a bare design config', () => {
    const values = new Map([[SESSION_KEY, JSON.stringify(DEFAULT_POT)]])
    expect(loadSession({ getItem: (key: string) => values.get(key) ?? null })).toBeNull()
  })

  it('rejects versioned session envelopes', () => {
    const storage = { getItem: () => JSON.stringify({ sessionVersion: 1, config: DEFAULT_POT, highFidelityPreview: true }) }
    expect(loadSession(storage)).toBeNull()
  })

  it('uses a stable session key', () => {
    expect(SESSION_KEY).toBe('drawer-generator:session')
  })
})

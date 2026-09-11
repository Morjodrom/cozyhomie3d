import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY } from './design'
import { loadSession, saveSession } from './persistence'

function createStorage() {
  const values = new Map<string, string>()
  return {
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: vi.fn((key: string) => { values.delete(key) }),
    },
  }
}

describe('session persistence', () => {
  it('round-trips the current session contract', () => {
    const { storage } = createStorage()
    const session = { config: DEFAULT_POT, highFidelityPreview: true }

    saveSession(storage, session)

    expect(loadSession(storage)).toEqual(session)
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('deletes invalid stored data', () => {
    const storage = {
      getItem: () => '{bad json',
      removeItem: vi.fn(),
    }

    expect(loadSession(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledOnce()
  })

  it('deletes sessions that do not match the exact current shape', () => {
    const storage = {
      getItem: () => JSON.stringify({ config: { ...DEFAULT_POT, unknownField: true }, highFidelityPreview: false }),
      removeItem: vi.fn(),
    }

    expect(loadSession(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledOnce()
  })

  it('deletes sessions saved with the removed texture coverage setting', () => {
    if (DEFAULT_POT.texture.kind === 'smooth') throw new Error('Broken texture fixture')
    const { bottomOffsetPercent: _bottomOffsetPercent, topOffsetPercent: _topOffsetPercent, ...legacyTexture } = DEFAULT_POT.texture
    const storage = {
      getItem: () => JSON.stringify({
        config: { ...DEFAULT_POT, texture: { ...legacyTexture, coveragePercent: 82 } },
        highFidelityPreview: false,
      }),
      removeItem: vi.fn(),
    }

    expect(loadSession(storage)).toBeNull()
    expect(storage.removeItem).toHaveBeenCalledOnce()
  })

  it('returns null when cleanup is unavailable', () => {
    const storage = {
      getItem: () => '{bad json',
      removeItem: () => { throw new Error('Storage is read-only') },
    }

    expect(loadSession(storage)).toBeNull()
  })

  it('restores drawer texture wall selections', () => {
    const { storage } = createStorage()
    const session = { config: { ...DEFAULT_DRAWER, textureWalls: { front: true, sides: false, back: false } }, highFidelityPreview: false }

    saveSession(storage, session)

    expect(loadSession(storage)).toEqual(session)
  })

  it('restores current pot-with-tray settings', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const { storage } = createStorage()
    const session = { config: { ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, heightMm: 24 } }, highFidelityPreview: false }

    saveSession(storage, session)

    expect(loadSession(storage)).toEqual(session)
  })
})

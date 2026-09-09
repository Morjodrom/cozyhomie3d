import { designConfigSchema, type DesignConfig } from './design'

export const SESSION_KEY = 'drawer-generator:session:v5'
export const SESSION_VERSION = 1 as const
/** Kept only for callers/tests that need to identify data intentionally ignored after the v5 contract. */
export const LEGACY_SESSION_KEY = 'drawer-generator:session:v4'

export type Session = {
  config: DesignConfig
  highFidelityPreview: boolean
}

export function loadSession(storage: Pick<Storage, 'getItem'>): Session | null {
  try {
    const value = storage.getItem(SESSION_KEY)
    if (!value) return null
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && parsed.sessionVersion === SESSION_VERSION && 'config' in parsed) {
      return { config: designConfigSchema.parse(parsed.config), highFidelityPreview: parsed.highFidelityPreview === true }
    }
    return { config: designConfigSchema.parse(parsed), highFidelityPreview: false }
  } catch {
    return null
  }
}

export function saveSession(storage: Pick<Storage, 'setItem'>, session: Session): void {
  storage.setItem(SESSION_KEY, JSON.stringify({ sessionVersion: SESSION_VERSION, config: designConfigSchema.parse(session.config), highFidelityPreview: session.highFidelityPreview }))
}

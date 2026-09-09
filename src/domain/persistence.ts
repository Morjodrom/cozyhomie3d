import { designConfigSchema, type DesignConfig } from './design'

export const SESSION_KEY = 'drawer-generator:session:v2'
/** Kept only for callers/tests that need to identify data intentionally ignored after the v2 contract. */
export const LEGACY_SESSION_KEY = 'drawer-generator:session:v1'

export function loadSession(storage: Pick<Storage, 'getItem'>): DesignConfig | null {
  try {
    const value = storage.getItem(SESSION_KEY)
    return value ? designConfigSchema.parse(JSON.parse(value)) : null
  } catch {
    return null
  }
}

export function saveSession(storage: Pick<Storage, 'setItem'>, config: DesignConfig): void {
  storage.setItem(SESSION_KEY, JSON.stringify(designConfigSchema.parse(config)))
}

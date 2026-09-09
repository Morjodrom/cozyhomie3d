import { z } from 'zod'
import { designConfigSchema } from './design'

export const SESSION_KEY = 'drawer-generator:session'

const sessionSchema = z.strictObject({
  config: designConfigSchema,
  highFidelityPreview: z.boolean(),
})

export type Session = z.infer<typeof sessionSchema>

export function loadSession(storage: Pick<Storage, 'getItem'>): Session | null {
  try {
    const value = storage.getItem(SESSION_KEY)
    if (!value) return null
    return sessionSchema.parse(JSON.parse(value))
  } catch {
    return null
  }
}

export function saveSession(storage: Pick<Storage, 'setItem'>, session: Session): void {
  storage.setItem(SESSION_KEY, JSON.stringify(sessionSchema.parse(session)))
}

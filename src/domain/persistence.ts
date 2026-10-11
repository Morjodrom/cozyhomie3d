import { z } from 'zod';
import { designConfigSchema } from './design';
import { legacyCircularLoftConfigSchema } from '../shapes/circular-loft/domain/legacy';

const SESSION_KEY = 'drawer-generator:session';

const sessionSchema = z.strictObject({
    config: designConfigSchema,
    highFidelityPreview: z.boolean(),
});

const readableSessionSchema = sessionSchema.or(
    z.strictObject({
        config: legacyCircularLoftConfigSchema,
        highFidelityPreview: z.boolean(),
    }),
);

export type Session = z.infer<typeof sessionSchema>;

export function loadSession(storage: Pick<Storage, 'getItem' | 'removeItem'>): Session | null {
    try {
        const value = storage.getItem(SESSION_KEY);
        if (!value) return null;
        return readableSessionSchema.parse(JSON.parse(value));
    } catch {
        try {
            storage.removeItem(SESSION_KEY);
        } catch {
            // Session cleanup is best-effort; storage can be unavailable or read-only.
        }
        return null;
    }
}

export function saveSession(storage: Pick<Storage, 'setItem'>, session: Session): void {
    storage.setItem(SESSION_KEY, JSON.stringify(sessionSchema.parse(session)));
}

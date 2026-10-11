import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAY_PARAMETERS, trayParametersSchema } from './design';

describe('tray parameters', () => {
    it('accepts the fitted tray defaults unchanged', () => {
        expect(trayParametersSchema.parse(DEFAULT_TRAY_PARAMETERS)).toEqual({
            heightMm: 18,
            wallThicknessMm: 2,
            bottomThicknessMm: 3,
            engagementWidthMm: 2,
            engagementDepthMm: 1.5,
            fitClearanceMm: 0.25,
            previewGapMm: 12,
        });
    });

    it('keeps the engagement error on the original field', () => {
        const result = trayParametersSchema.safeParse({
            ...DEFAULT_TRAY_PARAMETERS,
            engagementWidthMm: 3,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual([
                {
                    code: 'custom',
                    path: ['engagementWidthMm'],
                    message: 'Engagement width must not exceed tray wall thickness.',
                },
            ]);
        }
    });
});

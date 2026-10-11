import { describe, expect, it } from 'vitest';
import { designConfigSchema } from '../../../domain/design';
import {
    DEFAULT_CIRCULAR_LOFT,
    type CircularLoftParameters,
    circularLoftRequiredSegments,
} from './design';
import {
    appendCircularLoftCircle,
    appendCircularLoftSection,
    insertCircularLoftMiddleSection,
    removeCircularLoftInnermostCircle,
    removeCircularLoftSection,
} from './operations';

describe('circular-loft domain', () => {
    it('validates the default config without texture or legacy features', () => {
        expect(designConfigSchema.safeParse(DEFAULT_CIRCULAR_LOFT).success).toBe(true);
    });

    it.each([
        { name: 'zero diameter', diameterMm: 0, xMm: 0, gapMm: 60 },
        { name: 'negative diameter', diameterMm: -1, xMm: 0, gapMm: 60 },
        { name: 'infinite diameter', diameterMm: Infinity, xMm: 0, gapMm: 60 },
        { name: 'empty coordinate', diameterMm: 60, xMm: NaN, gapMm: 60 },
        { name: 'infinite coordinate', diameterMm: 60, xMm: Infinity, gapMm: 60 },
        { name: 'negative gap', diameterMm: 60, xMm: 0, gapMm: -1 },
        { name: 'zero total height', diameterMm: 60, xMm: 0, gapMm: 0 },
        { name: 'infinite gap', diameterMm: 60, xMm: 0, gapMm: Infinity },
    ])('rejects $name', ({ diameterMm, xMm, gapMm }) => {
        const parameters = {
            sections: [
                { circles: [{ diameterMm, xMm, yMm: 0 }] },
                { circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }] },
            ],
            gapsMm: [gapMm],
        };

        expect(designConfigSchema.safeParse({ type: 'circular-loft', parameters }).success).toBe(
            false,
        );
    });

    it('rejects overflow of the accumulated height even when each gap is finite', () => {
        const config = {
            type: 'circular-loft',
            parameters: {
                sections: Array.from({ length: 3 }, () => ({
                    circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }],
                })),
                gapsMm: [Number.MAX_VALUE, Number.MAX_VALUE],
            },
        };

        const result = designConfigSchema.safeParse(config);

        expect(result.success).toBe(false);
        if (!result.success)
            expect(result.error.issues[0].message).toMatch(/height must be finite/);
    });

    it('allows a zero diameter only for the deepest void boundary', () => {
        const zeroVoid = {
            type: 'circular-loft' as const,
            parameters: {
                sections: [
                    {
                        circles: [
                            { diameterMm: 100, xMm: 0, yMm: 0 },
                            { diameterMm: 70, xMm: 0, yMm: 0 },
                            { diameterMm: 50, xMm: 0, yMm: 0 },
                            { diameterMm: 0, xMm: 20, yMm: 0 },
                        ],
                    },
                    {
                        circles: [
                            { diameterMm: 100, xMm: 0, yMm: 0 },
                            { diameterMm: 70, xMm: 0, yMm: 0 },
                            { diameterMm: 50, xMm: 0, yMm: 0 },
                            { diameterMm: 20, xMm: 5, yMm: 0 },
                        ],
                    },
                ],
                gapsMm: [30],
            },
        };

        expect(designConfigSchema.safeParse(zeroVoid).success).toBe(true);
    });

    it('keeps a zero-diameter point strictly inside its preceding circle', () => {
        const pointInside = {
            ...DEFAULT_CIRCULAR_LOFT,
            parameters: {
                sections: Array.from({ length: 2 }, () => ({
                    circles: [
                        { diameterMm: 100, xMm: 0, yMm: 0 },
                        { diameterMm: 0, xMm: 49.9, yMm: -1 },
                    ],
                })),
                gapsMm: [30],
            },
        };
        const pointOnBoundary = {
            ...pointInside,
            parameters: {
                ...pointInside.parameters,
                sections: pointInside.parameters.sections.map(() => ({
                    circles: [
                        { diameterMm: 100, xMm: 0, yMm: 0 },
                        { diameterMm: 0, xMm: 50, yMm: 0 },
                    ],
                })),
            },
        };

        expect(designConfigSchema.safeParse(pointInside).success).toBe(true);
        expect(designConfigSchema.safeParse(pointOnBoundary).success).toBe(false);
    });

    it.each([
        {
            name: 'material boundary',
            circles: [
                { diameterMm: 0, xMm: 0, yMm: 0 },
                { diameterMm: 0, xMm: 0, yMm: 0 },
            ],
        },
        {
            name: 'intermediate void boundary',
            circles: [
                { diameterMm: 100, xMm: 0, yMm: 0 },
                { diameterMm: 0, xMm: 0, yMm: 0 },
                { diameterMm: 20, xMm: 0, yMm: 0 },
                { diameterMm: 10, xMm: 0, yMm: 0 },
            ],
        },
    ])('rejects a zero $name', ({ circles }) => {
        const parameters = {
            sections: [{ circles }, { circles }],
            gapsMm: [30],
        };

        expect(designConfigSchema.safeParse({ type: 'circular-loft', parameters }).success).toBe(
            false,
        );
    });

    it('rejects unequal, non-nested, and malformed stepped sections at their field paths', () => {
        const invalid = {
            ...DEFAULT_CIRCULAR_LOFT,
            parameters: {
                sections: [
                    { circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }] },
                    {
                        circles: [
                            { diameterMm: 60, xMm: 0, yMm: 0 },
                            { diameterMm: 60, xMm: 0, yMm: 0 },
                        ],
                    },
                    { circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }] },
                ],
                gapsMm: [0, 0],
            },
        };

        const result = designConfigSchema.safeParse(invalid);

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error.issues.map((issue) => issue.path)).toEqual(
            expect.arrayContaining([
                ['parameters', 'sections', 1, 'circles'],
                ['parameters', 'sections', 1, 'circles', 1],
                ['parameters', 'gapsMm', 0],
                ['parameters', 'gapsMm', 1],
            ]),
        );
    });

    it('adapts a shared angular grid for an eccentric near-nested circle', () => {
        const parameters: CircularLoftParameters = {
            sections: [
                {
                    circles: [
                        { diameterMm: 100, xMm: 0, yMm: 0 },
                        { diameterMm: 80, xMm: 9.999, yMm: 0 },
                    ],
                },
                {
                    circles: [
                        { diameterMm: 100, xMm: 0, yMm: 0 },
                        { diameterMm: 80, xMm: 9.999, yMm: 0 },
                    ],
                },
            ],
            gapsMm: [20],
        };

        expect(circularLoftRequiredSegments(parameters, 48)).toBeGreaterThan(48);
    });

    it('returns immutable valid parameters for circle and section editing operations', () => {
        const withCircle = appendCircularLoftCircle(DEFAULT_CIRCULAR_LOFT.parameters);
        const split = insertCircularLoftMiddleSection(withCircle, 0);
        const appended = appendCircularLoftSection(split);
        const removedInterior = removeCircularLoftSection(appended, 1);
        const restored = removeCircularLoftInnermostCircle(removedInterior);
        const withoutFirst = removeCircularLoftSection(appended, 0);
        const withoutLast = removeCircularLoftSection(appended, appended.sections.length - 1);

        expect(DEFAULT_CIRCULAR_LOFT.parameters.sections).toHaveLength(2);
        expect(withCircle.sections[0].circles).toEqual([
            { diameterMm: 60, xMm: 0, yMm: 0 },
            { diameterMm: 30, xMm: 0, yMm: 0 },
        ]);
        expect(split.gapsMm).toEqual([30, 30]);
        expect(appended.gapsMm).toEqual([30, 30, 30]);
        expect(restored.sections).toHaveLength(3);
        expect(restored.sections[0].circles).toHaveLength(1);
        expect(withoutFirst.gapsMm).toEqual([30, 30]);
        expect(withoutLast.gapsMm).toEqual([30, 30]);
        expect(
            designConfigSchema.safeParse({ ...DEFAULT_CIRCULAR_LOFT, parameters: restored })
                .success,
        ).toBe(true);
    });

    it('keeps zero-length insertion drafts visible to schema validation', () => {
        const parameters: CircularLoftParameters = {
            sections: Array.from({ length: 4 }, () => ({
                circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }],
            })),
            gapsMm: [20, 0, 20],
        };

        const inserted = insertCircularLoftMiddleSection(parameters, 1);

        expect(inserted.gapsMm).toEqual([20, 0, 0, 20]);
        expect(
            designConfigSchema.safeParse({ ...DEFAULT_CIRCULAR_LOFT, parameters: inserted })
                .success,
        ).toBe(false);
    });

    it('does not allow deletion of the required final circle or section pair', () => {
        expect(removeCircularLoftInnermostCircle(DEFAULT_CIRCULAR_LOFT.parameters)).toEqual(
            DEFAULT_CIRCULAR_LOFT.parameters,
        );
        expect(() => removeCircularLoftSection(DEFAULT_CIRCULAR_LOFT.parameters, 0)).toThrow(
            /at least two sections/,
        );
    });
});

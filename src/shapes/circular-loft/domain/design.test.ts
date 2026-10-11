import { describe, expect, it } from 'vitest';
import { designConfigSchema } from '../../../domain/design';
import {
    DEFAULT_CIRCULAR_LOFT,
    type CircularLoftParameters,
    circularLoftRequiredSegments,
    circularLoftCircleCenter,
    circularLoftOffsetFromCenter,
    circularLoftCircleSchema,
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
        { name: 'zero diameter', diameterMm: 0, offsetDistanceMm: 0, gapMm: 60 },
        { name: 'negative diameter', diameterMm: -1, offsetDistanceMm: 0, gapMm: 60 },
        { name: 'infinite diameter', diameterMm: Infinity, offsetDistanceMm: 0, gapMm: 60 },
        { name: 'empty distance', diameterMm: 60, offsetDistanceMm: NaN, gapMm: 60 },
        { name: 'infinite distance', diameterMm: 60, offsetDistanceMm: Infinity, gapMm: 60 },
        { name: 'negative gap', diameterMm: 60, offsetDistanceMm: 0, gapMm: -1 },
        { name: 'zero total height', diameterMm: 60, offsetDistanceMm: 0, gapMm: 0 },
        { name: 'infinite gap', diameterMm: 60, offsetDistanceMm: 0, gapMm: Infinity },
    ])('rejects $name', ({ diameterMm, offsetDistanceMm, gapMm }) => {
        const parameters = {
            sections: [
                { circles: [{ diameterMm, offsetDistanceMm, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
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
                    circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
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
                            { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 70, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 50, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 0, offsetDistanceMm: 20, offsetAngleDeg: 90 },
                        ],
                    },
                    {
                        circles: [
                            { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 70, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 50, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 20, offsetDistanceMm: 5, offsetAngleDeg: 90 },
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
                        { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        {
                            diameterMm: 0,
                            offsetDistanceMm: 49.91001903425804,
                            offsetAngleDeg: 91.14805834216077,
                        },
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
                        { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        { diameterMm: 0, offsetDistanceMm: 50, offsetAngleDeg: 90 },
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
                { diameterMm: 0, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 0, offsetDistanceMm: 0, offsetAngleDeg: 0 },
            ],
        },
        {
            name: 'intermediate void boundary',
            circles: [
                { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 0, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 10, offsetDistanceMm: 0, offsetAngleDeg: 0 },
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
                    { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                    {
                        circles: [
                            { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        ],
                    },
                    { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
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
                        { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        { diameterMm: 80, offsetDistanceMm: 9.999, offsetAngleDeg: 90 },
                    ],
                },
                {
                    circles: [
                        { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        { diameterMm: 80, offsetDistanceMm: 9.999, offsetAngleDeg: 90 },
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
            { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
            { diameterMm: 30, offsetDistanceMm: 0, offsetAngleDeg: 0 },
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
                circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
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

describe('polar circle offsets', () => {
    it.each([
        { angle: 0, x: 0, y: 10 },
        { angle: 90, x: 10, y: 0 },
        { angle: 180, x: 0, y: -10 },
        { angle: 270, x: -10, y: 0 },
        { angle: -90, x: -10, y: 0 },
        { angle: 810, x: 10, y: 0 },
    ])('resolves $angle clockwise degrees from +Y', ({ angle, x, y }) => {
        const center = circularLoftCircleCenter({ offsetDistanceMm: 10, offsetAngleDeg: angle });
        expect(center.xMm).toBeCloseTo(x, 12);
        expect(center.yMm).toBeCloseTo(y, 12);
    });

    it('reduces extreme finite angles before converting to radians', () => {
        const center = circularLoftCircleCenter({
            offsetDistanceMm: 10,
            offsetAngleDeg: Number.MAX_VALUE,
        });
        const reduced = circularLoftCircleCenter({
            offsetDistanceMm: 10,
            offsetAngleDeg: Number.MAX_VALUE % 360,
        });
        expect(center).toEqual(reduced);
        expect(Number.isFinite(center.xMm) && Number.isFinite(center.yMm)).toBe(true);
    });

    it.each([-1, NaN, Infinity])('rejects invalid distance %s', (offsetDistanceMm) => {
        expect(
            circularLoftCircleSchema.safeParse({
                diameterMm: 60,
                offsetDistanceMm,
                offsetAngleDeg: 0,
            }).success,
        ).toBe(false);
    });

    it.each([NaN, Infinity, -Infinity])('rejects nonfinite angle %s', (offsetAngleDeg) => {
        expect(
            circularLoftCircleSchema.safeParse({
                diameterMm: 60,
                offsetDistanceMm: 0,
                offsetAngleDeg,
            }).success,
        ).toBe(false);
    });

    it('preserves unwrapped angles at zero distance and when adding boundaries or sections', () => {
        const circle = { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: -810 };
        const parameters = {
            sections: [{ circles: [circle] }, { circles: [circle] }],
            gapsMm: [60],
        };
        expect(circularLoftCircleSchema.parse(circle)).toEqual(circle);
        expect(circularLoftCircleCenter(circle).xMm).toBeCloseTo(0);
        expect(circularLoftCircleCenter(circle).yMm).toBeCloseTo(0);
        expect(appendCircularLoftCircle(parameters).sections[0].circles[1].offsetAngleDeg).toBe(
            -810,
        );
        expect(appendCircularLoftSection(parameters).sections[2].circles[0]).toEqual(circle);
    });

    it('inserts a Cartesian midpoint, not a polar-average arc', () => {
        const parameters = {
            sections: [
                { circles: [{ diameterMm: 60, offsetDistanceMm: 10, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 40, offsetDistanceMm: 10, offsetAngleDeg: 90 }] },
            ],
            gapsMm: [60],
        };
        const circle = insertCircularLoftMiddleSection(parameters, 0).sections[1].circles[0];
        expect(circle.diameterMm).toBe(50);
        expect(circle.offsetDistanceMm).toBeCloseTo(Math.sqrt(50));
        expect(circle.offsetAngleDeg).toBe(45);
        expect(circularLoftCircleCenter(circle).xMm).toBeCloseTo(5);
        expect(circularLoftCircleCenter(circle).yMm).toBeCloseTo(5);
    });

    it('retains the lower direction for an exactly centered midpoint', () => {
        const parameters = {
            sections: [
                { circles: [{ diameterMm: 60, offsetDistanceMm: 10, offsetAngleDeg: -270 }] },
                { circles: [{ diameterMm: 60, offsetDistanceMm: 10, offsetAngleDeg: 270 }] },
            ],
            gapsMm: [60],
        };
        const circle = insertCircularLoftMiddleSection(parameters, 0).sections[1].circles[0];
        expect(circle.offsetDistanceMm).toBe(0);
        expect(circle.offsetAngleDeg).toBe(-270);
    });

    it.each([
        { x: 3, y: -4 },
        { x: -3, y: 4 },
        { x: -3, y: -4 },
    ])('round-trips center ($x, $y)', ({ x, y }) => {
        const center = circularLoftCircleCenter(circularLoftOffsetFromCenter(x, y));
        expect(center.xMm).toBeCloseTo(x, 12);
        expect(center.yMm).toBeCloseTo(y, 12);
    });

    it('validates nesting using absolute centers rather than differences of polar distances', () => {
        const parameters = {
            sections: Array.from({ length: 2 }, () => ({
                circles: [
                    { diameterMm: 60, offsetDistanceMm: 10, offsetAngleDeg: 0 },
                    { diameterMm: 30, offsetDistanceMm: 10, offsetAngleDeg: 180 },
                ],
            })),
            gapsMm: [60],
        };
        expect(designConfigSchema.safeParse({ type: 'circular-loft', parameters }).success).toBe(
            false,
        );
        parameters.sections[0].circles[1].offsetAngleDeg = 360;
        parameters.sections[1].circles[1].offsetAngleDeg = 360;
        expect(designConfigSchema.safeParse({ type: 'circular-loft', parameters }).success).toBe(
            true,
        );
    });
});

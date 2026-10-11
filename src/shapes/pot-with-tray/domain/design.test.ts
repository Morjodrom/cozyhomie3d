import { describe, expect, it } from 'vitest';
import { DEFAULT_BED_ADHESION_BEAMS } from '../../../domain/shared/features';
import { designConfigSchema } from '../../../domain/design';
import { DEFAULT_POT } from '../../pot/domain/design';
import { DEFAULT_POT_WITH_TRAY } from './design';

describe('shape design schemas', () => {
    it('adds printable tray defaults without changing the inherited pot parameters', () => {
        if (DEFAULT_POT.type !== 'pot' || DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray')
            throw new Error('Broken pot fixtures');
        expect(DEFAULT_POT_WITH_TRAY.parameters).toEqual(DEFAULT_POT.parameters);
        expect(DEFAULT_POT_WITH_TRAY.tray).toEqual({
            heightMm: 18,
            wallThicknessMm: 2,
            bottomThicknessMm: 3,
            engagementWidthMm: 2,
            engagementDepthMm: 1.5,
            fitClearanceMm: 0.25,
            previewGapMm: 12,
        });
        expect(DEFAULT_POT_WITH_TRAY.bedAdhesionBeams).toEqual(DEFAULT_BED_ADHESION_BEAMS);
    });

    it('validates independent tray engagement width and thick tray walls', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const sturdy = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, bottomThicknessMm: 6 },
            tray: {
                ...DEFAULT_POT_WITH_TRAY.tray,
                wallThicknessMm: 10,
                engagementWidthMm: 5,
                engagementDepthMm: 5,
            },
        };

        expect(designConfigSchema.safeParse(sturdy).success).toBe(true);
        for (const engagementWidthMm of [1.19, 25.01]) {
            expect(
                designConfigSchema.safeParse({
                    ...DEFAULT_POT_WITH_TRAY,
                    tray: { ...DEFAULT_POT_WITH_TRAY.tray, engagementWidthMm },
                }).success,
            ).toBe(false);
        }
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 20 },
            }).success,
        ).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 20.01 },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: {
                    ...DEFAULT_POT_WITH_TRAY.tray,
                    wallThicknessMm: 2,
                    engagementWidthMm: 2.01,
                },
            }).success,
        ).toBe(false);
        const { engagementWidthMm: _engagementWidthMm, ...trayWithoutEngagementWidth } =
            DEFAULT_POT_WITH_TRAY.tray;
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: trayWithoutEngagementWidth,
            }).success,
        ).toBe(false);
    });

    it('validates the projected tray, hidden connector, and flush rigidity placement', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const outside = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: {
                ...DEFAULT_POT_WITH_TRAY.parameters,
                rigidityRibs: {
                    ...DEFAULT_POT_WITH_TRAY.parameters.rigidityRibs,
                    placement: 'outside' as const,
                },
            },
        };
        const shallowFloor = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, bottomThicknessMm: 2 },
            tray: { ...DEFAULT_POT_WITH_TRAY.tray, engagementDepthMm: 1.5 },
        };
        const collapsedProjection = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: {
                ...DEFAULT_POT_WITH_TRAY.parameters,
                heightMm: 30,
                bottomDiameterMm: 30,
                topDiameterMm: 350,
            },
        };
        const connectorCollision = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: {
                ...DEFAULT_POT_WITH_TRAY.parameters,
                drainageHoles: [
                    {
                        ...DEFAULT_POT_WITH_TRAY.parameters.drainageHoles[0],
                        position: { x: 0.9, y: 0 },
                    },
                ],
            },
        };

        expect(designConfigSchema.safeParse(outside).success).toBe(false);
        expect(designConfigSchema.safeParse(shallowFloor).success).toBe(false);
        expect(designConfigSchema.safeParse(collapsedProjection).success).toBe(false);
        expect(designConfigSchema.safeParse(connectorCollision).success).toBe(false);
    });

    it('requires a bounded preview-only tray gap', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 0 },
            }).success,
        ).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 500 },
            }).success,
        ).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: -0.01 },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 500.01 },
            }).success,
        ).toBe(false);
        const { previewGapMm: _previewGapMm, ...trayWithoutPreviewGap } =
            DEFAULT_POT_WITH_TRAY.tray;
        expect(
            designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: trayWithoutPreviewGap })
                .success,
        ).toBe(false);
    });
});

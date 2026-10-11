import { describe, expect, it } from 'vitest';
import { designConfigSchema } from '../../../domain/design';
import { DEFAULT_DRAWER } from './design';

describe('shape design schemas', () => {
    it('supports independent drawer rib directions while rejecting an empty enabled grid', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture');
        const ribs = DEFAULT_DRAWER.parameters.bottomRibs;
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, xCount: 0 } },
            }).success,
        ).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, yCount: 0 } },
            }).success,
        ).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: {
                    ...DEFAULT_DRAWER.parameters,
                    bottomRibs: { ...ribs, xCount: 0, yCount: 0 },
                },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: {
                    ...DEFAULT_DRAWER.parameters,
                    bottomRibs: { ...ribs, enabled: false, xCount: 0, yCount: 0 },
                },
            }).success,
        ).toBe(true);
    });

    it('defaults drawers to texturing every wall group and requires the complete selection', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture');
        expect(DEFAULT_DRAWER.textureWalls).toEqual({ front: true, sides: true, back: true });
        const { back: _back, ...incomplete } = DEFAULT_DRAWER.textureWalls;
        expect(
            designConfigSchema.safeParse({ ...DEFAULT_DRAWER, textureWalls: incomplete }).success,
        ).toBe(false);
    });

    it('rejects a drawer handle wider than its safe mounting area', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture');
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: { ...DEFAULT_DRAWER.parameters, handleWidthMm: 119 },
            }).success,
        ).toBe(false);
    });

    it('accepts both drawer handle styles and validates their physical envelope', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture');
        expect(designConfigSchema.safeParse(DEFAULT_DRAWER).success).toBe(true);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_DRAWER,
                parameters: { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed' },
            }).success,
        ).toBe(true);

        const invalidParameters = [
            { handlePositionPercent: -1 },
            { handlePositionPercent: 101 },
            { handleHeightMm: 51 },
            { handleHeightMm: 10, handleDepthMm: 11 },
            { handleCornerRadiusMm: -0.01 },
            { handleStyle: 'recessed' as const, handleHeightMm: 47 },
            { handleStyle: 'recessed' as const, depthMm: 30, handleDepthMm: 25 },
            { handleStyle: 'recessed' as const, handleCornerRadiusMm: 6.01 },
        ];
        for (const overrides of invalidParameters) {
            expect(
                designConfigSchema.safeParse({
                    ...DEFAULT_DRAWER,
                    parameters: { ...DEFAULT_DRAWER.parameters, ...overrides },
                }).success,
            ).toBe(false);
        }
    });

    it('allows square through fully rounded reinforced openings', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture');
        expect(DEFAULT_DRAWER.parameters.handleCornerRadiusMm).toBe(3);
        for (const handleCornerRadiusMm of [0, DEFAULT_DRAWER.parameters.handleHeightMm / 2]) {
            const parameters = {
                ...DEFAULT_DRAWER.parameters,
                handleStyle: 'recessed' as const,
                handleCornerRadiusMm,
            };
            expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters }).success).toBe(
                true,
            );
        }
    });
});

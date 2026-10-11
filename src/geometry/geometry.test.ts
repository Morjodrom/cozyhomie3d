import { DEFAULT_DRAWER } from '../shapes/drawer/domain/design';
import { DEFAULT_POT } from '../shapes/pot/domain/design';
import { DEFAULT_POT_WITH_TRAY } from '../shapes/pot-with-tray/domain/design';
import { TEXTURE_KINDS, createTextureDefault } from '../domain/shared/textures';
import { type DesignConfig } from '../domain/design';
import { type BuildQuality } from '../domain/worker';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from './build';
import {
    CELL_TEXTURE_QUALITY_CASES,
    createSparseTexture,
    intersectionsAlongY,
    intersectionsAlongX,
    triangleArea,
    singleMesh,
} from './testing/mesh';

type TexturedDesignConfig = Exclude<DesignConfig, { type: 'circular-loft' }>;

describe('geometry generation', () => {
    it.each([
        { name: 'pot', config: DEFAULT_POT },
        { name: 'drawer', config: DEFAULT_DRAWER },
    ] as const)(
        'adds connected inside rigidity without changing $name exterior bounds',
        async ({ config }) => {
            const disabled = {
                ...config,
                parameters: {
                    ...config.parameters,
                    rigidityRibs: { ...config.parameters.rigidityRibs, enabled: false },
                },
            } as TexturedDesignConfig;
            const reinforced = await buildGeometry(config, 'draft');
            const baseline = await buildGeometry(disabled, 'draft');

            expect(reinforced.stats.volumeMm3).toBeGreaterThan(baseline.stats.volumeMm3);
            reinforced.stats.boundsMm.forEach((dimension, index) =>
                expect(dimension).toBeCloseTo(baseline.stats.boundsMm[index], 3),
            );
            expect(
                triangleArea(singleMesh(reinforced).positions, singleMesh(reinforced).indices),
            ).toBeLessThanOrEqual(
                triangleArea(singleMesh(baseline).positions, singleMesh(baseline).indices) * 1.1,
            );
        },
    );

    it.each([
        { name: 'pot', config: DEFAULT_POT },
        { name: 'drawer', config: DEFAULT_DRAWER },
    ] as const)(
        'allows outside $name rigidity to expand lateral bounds but not height',
        async ({ config }) => {
            const outside = {
                ...config,
                texture: createTextureDefault('smooth'),
                parameters: {
                    ...config.parameters,
                    rigidityRibs: {
                        ...config.parameters.rigidityRibs,
                        placement: 'outside' as const,
                    },
                },
            } as TexturedDesignConfig;
            const inside = {
                ...outside,
                parameters: {
                    ...outside.parameters,
                    rigidityRibs: {
                        ...outside.parameters.rigidityRibs,
                        placement: 'inside' as const,
                    },
                },
            } as TexturedDesignConfig;
            const outer = await buildGeometry(outside, 'draft');
            const inner = await buildGeometry(inside, 'draft');

            expect(outer.stats.boundsMm[2]).toBeCloseTo(inner.stats.boundsMm[2], 3);
            if (config.type === 'pot') {
                const cylindrical = {
                    ...outside,
                    parameters: {
                        ...outside.parameters,
                        bottomDiameterMm: 100,
                        topDiameterMm: 100,
                    },
                } as Extract<DesignConfig, { type: 'pot' }>;
                const cylindricalInner = {
                    ...cylindrical,
                    parameters: {
                        ...cylindrical.parameters,
                        rigidityRibs: {
                            ...cylindrical.parameters.rigidityRibs,
                            placement: 'inside' as const,
                        },
                    },
                } as Extract<DesignConfig, { type: 'pot' }>;
                const expanded = await buildGeometry(cylindrical, 'draft');
                const baseline = await buildGeometry(cylindricalInner, 'draft');
                expect(expanded.stats.boundsMm[0] - baseline.stats.boundsMm[0]).toBeCloseTo(
                    2 * cylindrical.parameters.rigidityRibs.wallBottomGussetMm,
                    2,
                );
            } else expect(outer.stats.boundsMm[0]).toBeGreaterThan(inner.stats.boundsMm[0]);
        },
    );

    it('keeps exterior rigidity connected with textured surfaces and a recessed handle', async () => {
        if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer')
            throw new Error('Broken default fixtures');
        const pot = await buildGeometry(
            {
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs, placement: 'outside' },
                },
            },
            'draft',
        );
        const drawer = await buildGeometry(
            {
                ...DEFAULT_DRAWER,
                parameters: {
                    ...DEFAULT_DRAWER.parameters,
                    handleStyle: 'recessed',
                    handlePositionPercent: 50,
                    rigidityRibs: {
                        ...DEFAULT_DRAWER.parameters.rigidityRibs,
                        placement: 'outside',
                    },
                },
            },
            'draft',
        );

        expect(pot.stats.volumeMm3).toBeGreaterThan(0);
        expect(drawer.stats.volumeMm3).toBeGreaterThan(0);
    });

    it('places inside gusset surfaces above each model cavity floor', async () => {
        if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer')
            throw new Error('Broken default fixtures');
        const pot = await buildGeometry(
            { ...DEFAULT_POT, texture: createTextureDefault('smooth') },
            'draft',
        );
        const potFloor = DEFAULT_POT.parameters.bottomThicknessMm;
        const potSection = intersectionsAlongX(
            singleMesh(pot).positions,
            singleMesh(pot).indices,
            0,
            potFloor + DEFAULT_POT.parameters.rigidityRibs.wallBottomGussetMm / 2,
        );
        expect(potSection.some((x) => Math.abs(x) > 45 && Math.abs(x) < 48)).toBe(true);

        const drawer = await buildGeometry(
            { ...DEFAULT_DRAWER, texture: createTextureDefault('smooth') },
            'draft',
        );
        const drawerFloor = DEFAULT_DRAWER.parameters.bottomThicknessMm;
        const drawerSection = intersectionsAlongY(
            singleMesh(drawer).positions,
            singleMesh(drawer).indices,
            0,
            drawerFloor + DEFAULT_DRAWER.parameters.rigidityRibs.wallBottomGussetMm / 2,
        );
        expect(drawerSection.some((y) => y > -42.5 && y < -40.5)).toBe(true);
    });

    it.each([
        { name: 'pot', config: DEFAULT_POT },
        { name: 'drawer', config: DEFAULT_DRAWER },
    ] as const)(
        'recesses the $name bottom without changing its external dimensions',
        async ({ config }) => {
            const disabled: DesignConfig = {
                ...config,
                parameters: {
                    ...config.parameters,
                    bottomRibs: { ...config.parameters.bottomRibs, enabled: false },
                },
            } as DesignConfig;

            const recessed = await buildGeometry(config, 'draft');
            const smoothBottom = await buildGeometry(disabled, 'draft');

            expect(recessed.stats.volumeMm3).toBeLessThan(smoothBottom.stats.volumeMm3);
            recessed.stats.boundsMm.forEach((dimension, index) =>
                expect(dimension).toBeCloseTo(smoothBottom.stats.boundsMm[index], 3),
            );
            expect(Array.from(singleMesh(recessed).positions).every(Number.isFinite)).toBe(true);
        },
    );

    it.each(['rounded', 'chamfered'] as const)(
        'applies %s structural edges while preserving model envelopes',
        async (style) => {
            if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer')
                throw new Error('Broken default fixtures');
            const pot = await buildGeometry(
                {
                    ...DEFAULT_POT,
                    parameters: { ...DEFAULT_POT.parameters, edgeTreatment: { style, sizeMm: 1 } },
                    texture: createTextureDefault('smooth'),
                },
                'draft',
            );
            const drawer = await buildGeometry(
                {
                    ...DEFAULT_DRAWER,
                    parameters: {
                        ...DEFAULT_DRAWER.parameters,
                        edgeTreatment: { style, sizeMm: 1 },
                    },
                    texture: createTextureDefault('smooth'),
                },
                'draft',
            );

            expect(pot.stats.boundsMm[0]).toBeCloseTo(DEFAULT_POT.parameters.topDiameterMm, 1);
            expect(pot.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3);
            expect(drawer.stats.boundsMm[0]).toBeCloseTo(DEFAULT_DRAWER.parameters.widthMm, 3);
            expect(drawer.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3);
            expect(Array.from(singleMesh(pot).positions).every(Number.isFinite)).toBe(true);
            expect(Array.from(singleMesh(drawer).positions).every(Number.isFinite)).toBe(true);
        },
    );

    it.each(['rounded', 'chamfered'] as const)(
        'clamps an oversized %s maximum independently across every model',
        async (style) => {
            if (
                DEFAULT_POT.type !== 'pot' ||
                DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray' ||
                DEFAULT_DRAWER.type !== 'drawer'
            )
                throw new Error('Broken default fixtures');
            const edgeTreatment = { style, sizeMm: 20 };
            const pot = await buildGeometry(
                { ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, edgeTreatment } },
                'draft',
            );
            const assembly = await buildGeometry(
                {
                    ...DEFAULT_POT_WITH_TRAY,
                    parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, edgeTreatment },
                },
                'draft',
            );
            const drawer = await buildGeometry(
                { ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, edgeTreatment } },
                'draft',
            );

            expect(pot.parts).toHaveLength(1);
            expect(assembly.parts).toHaveLength(2);
            expect(drawer.parts).toHaveLength(1);
            for (const result of [pot, assembly, drawer]) {
                expect(result.stats.volumeMm3).toBeGreaterThan(0);
                expect(
                    result.parts.every((part) =>
                        Array.from(part.mesh.positions).every(Number.isFinite),
                    ),
                ).toBe(true);
            }
            expect(pot.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3);
            expect(assembly.stats.boundsMm[2]).toBeCloseTo(
                DEFAULT_POT_WITH_TRAY.parameters.heightMm + DEFAULT_POT_WITH_TRAY.tray.heightMm,
                3,
            );
            expect(drawer.stats.boundsMm[0]).toBeGreaterThanOrEqual(
                DEFAULT_DRAWER.parameters.widthMm,
            );
            expect(drawer.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3);
        },
    );

    it.each(TEXTURE_KINDS)('builds the %s texture on both supported models', async (kind) => {
        const texture = createSparseTexture(kind);
        for (const config of [
            { ...DEFAULT_POT, texture },
            { ...DEFAULT_POT_WITH_TRAY, texture },
            { ...DEFAULT_DRAWER, texture },
        ] as DesignConfig[]) {
            const result = await buildGeometry(config, 'draft');
            expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000);
            expect(
                result.parts.every((part) =>
                    Array.from(part.mesh.positions).every(Number.isFinite),
                ),
            ).toBe(true);
            if (config.type === 'pot-with-tray') expect(result.parts).toHaveLength(2);
        }
    });

    it.each(CELL_TEXTURE_QUALITY_CASES)(
        'builds finite $reliefMode $kind solids within the triangle limit at $quality quality',
        async ({ kind, quality, reliefMode }) => {
            const base = createSparseTexture(kind);
            if (base.kind !== 'honeycomb' && base.kind !== 'voronoi')
                throw new Error('Broken cell texture fixture');
            const texture = { ...base, reliefMode };
            for (const config of [
                { ...DEFAULT_POT, texture },
                { ...DEFAULT_DRAWER, texture },
            ] as DesignConfig[]) {
                const result = await buildGeometry(config, quality);

                expect(result.stats.volumeMm3).toBeGreaterThan(0);
                expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000);
                expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
            }
        },
    );

    it.each([-60, 0, 60])(
        'builds finite ribs at %s degrees on both supported models',
        async (angleDeg) => {
            const base = createTextureDefault('ribs');
            if (base.kind !== 'ribs') throw new Error('Broken texture fixture');
            const texture = {
                ...base,
                angleDeg,
                scaleMm: 12,
                depthMm: 0.5,
                bottomOffsetPercent: 20,
                topOffsetPercent: 20,
            };
            for (const config of [
                { ...DEFAULT_POT, texture },
                { ...DEFAULT_DRAWER, texture },
            ] as DesignConfig[]) {
                const result = await buildGeometry(config, 'draft');

                expect(result.stats.volumeMm3).toBeGreaterThan(0);
                expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000);
                expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
            }
        },
    );

    it.each(
        (['draft', 'preview', 'export'] satisfies BuildQuality[]).flatMap((quality) =>
            (['emboss', 'recess'] as const).map((reliefMode) => ({ quality, reliefMode })),
        ),
    )(
        'builds finite $reliefMode fractal solids at $quality quality',
        async ({ quality, reliefMode }) => {
            const base = createTextureDefault('fractal');
            if (base.kind !== 'fractal') throw new Error('Broken fractal fixture');
            const texture = {
                ...base,
                reliefMode,
                scaleMm: 30,
                levels: 2,
                bottomOffsetPercent: 20,
                topOffsetPercent: 20,
            };
            for (const config of [
                { ...DEFAULT_POT, texture },
                { ...DEFAULT_DRAWER, texture },
            ] as DesignConfig[]) {
                const result = await buildGeometry(config, quality);

                expect(result.stats.volumeMm3).toBeGreaterThan(0);
                expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000);
                expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
            }
        },
    );
});

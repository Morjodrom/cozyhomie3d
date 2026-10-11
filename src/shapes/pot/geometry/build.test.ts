import { DEFAULT_POT } from '../domain/design';
import { createTextureDefault } from '../../../domain/shared/textures';
import { type DesignConfig } from '../../../domain/design';
import {
    cavityFloorRadius,
    generateDrainageLayout,
    type DrainageHole,
    resolveDrainageHoles,
} from '../domain/drainage';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../../../geometry/build';
import { potTexturePerimeter } from './mesh';
import { resolveAxialEdgeTreatment } from '../../../geometry/surface/edge-treatment';
import { encodeBinaryStl } from '../../../geometry/stl';
import { planTessellation } from '../../../geometry/tessellation';
import { hasVertexAtRadiusAndZ, singleMesh } from '../../../geometry/testing/mesh';

describe('geometry generation', () => {
    it('connects a top-anchored outside hoop without changing smooth pot height', async () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const config = {
            ...DEFAULT_POT,
            texture: createTextureDefault('smooth'),
            parameters: {
                ...DEFAULT_POT.parameters,
                bottomDiameterMm: 100,
                topDiameterMm: 100,
                rigidityRibs: {
                    ...DEFAULT_POT.parameters.rigidityRibs,
                    placement: 'outside' as const,
                    count: 1,
                },
            },
        } satisfies Extract<DesignConfig, { type: 'pot' }>;
        const baseline = await buildGeometry(
            {
                ...config,
                parameters: {
                    ...config.parameters,
                    rigidityRibs: { ...config.parameters.rigidityRibs, enabled: false },
                },
            },
            'draft',
        );
        const reinforced = await buildGeometry(config, 'draft');
        const mesh = singleMesh(reinforced);
        const hoop = config.parameters.rigidityRibs;
        const hoopCenter = config.parameters.heightMm - hoop.baseWidthMm / 2;
        const outerRadius = config.parameters.topDiameterMm / 2;

        expect(hasVertexAtRadiusAndZ(mesh, outerRadius + hoop.projectionMm, hoopCenter)).toBe(true);
        expect(reinforced.stats.boundsMm[2]).toBeCloseTo(baseline.stats.boundsMm[2], 3);
        expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
    });

    it('builds the default pot as one printable solid with open drainage holes', async () => {
        const result = await buildGeometry(DEFAULT_POT, 'draft');
        expect(result.stats.triangleCount).toBeGreaterThan(100);
        expect(result.stats.volumeMm3).toBeGreaterThan(0);
        expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3);
        expect(singleMesh(result).indices.length).toBe(result.stats.triangleCount * 3);
        expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
    });

    it('resolves independent bottom and rim sizes without enlarging small requests', () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const maximum = { style: 'rounded' as const, sizeMm: 20 };
        const small = { style: 'rounded' as const, sizeMm: 0.4 };

        expect(
            resolveAxialEdgeTreatment(maximum, {
                bottomWallMm: 4,
                bottomThicknessMm: 6,
                topWallMm: 8,
            }),
        ).toEqual({
            bottomSizeMm: 2,
            topSizeMm: 4,
        });
        expect(
            resolveAxialEdgeTreatment(small, {
                bottomWallMm: 4,
                bottomThicknessMm: 6,
                topWallMm: 8,
            }),
        ).toEqual({
            bottomSizeMm: 0.4,
            topSizeMm: 0.4,
        });
    });

    it('rounds both drainage-hole mouths and preserves countersinks', async () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const first = DEFAULT_POT.parameters.drainageHoles[0];
        const rounded = {
            ...DEFAULT_POT.parameters,
            drainageHoles: [first],
            drainageHoleRounding: { enabled: true, radiusMm: 1 },
        };
        const countersunk = {
            ...rounded,
            drainageHoles: [{ ...first, countersink: { diameterMm: 10, depthMm: 1 } }],
        };

        const roundedResult = await buildGeometry(
            { ...DEFAULT_POT, parameters: rounded, texture: createTextureDefault('smooth') },
            'draft',
        );
        const countersunkResult = await buildGeometry(
            { ...DEFAULT_POT, parameters: countersunk, texture: createTextureDefault('smooth') },
            'draft',
        );

        expect(roundedResult.stats.volumeMm3).toBeGreaterThan(0);
        expect(countersunkResult.stats.volumeMm3).toBeLessThan(roundedResult.stats.volumeMm3);
    });

    it('unions overlapping ribs into one embossed or recessed printable solid', async () => {
        const ribs = createTextureDefault('ribs');
        if (DEFAULT_POT.type !== 'pot' || ribs.kind !== 'ribs')
            throw new Error('Broken texture fixture');
        const texture = { ...ribs, scaleMm: 2, depthMm: 1.2 };
        const smooth = await buildGeometry(
            { ...DEFAULT_POT, texture: createTextureDefault('smooth') },
            'draft',
        );

        // The fitted pitch is below each capsule's 2×depth width, so these ribs overlap.
        const repeats = Math.round(potTexturePerimeter(DEFAULT_POT.parameters) / texture.scaleMm);
        expect(potTexturePerimeter(DEFAULT_POT.parameters) / repeats).toBeLessThan(
            texture.depthMm * 2,
        );

        for (const reliefMode of ['emboss', 'recess'] as const) {
            const result = await buildGeometry(
                { ...DEFAULT_POT, texture: { ...texture, reliefMode } },
                'draft',
            );

            expect(singleMesh(result).indices.length).toBeGreaterThan(0);
            expect(result.stats.volumeMm3).toBeGreaterThan(0);
            if (reliefMode === 'emboss')
                expect(result.stats.volumeMm3).toBeGreaterThan(smooth.stats.volumeMm3);
            else expect(result.stats.volumeMm3).toBeLessThan(smooth.stats.volumeMm3);
        }
    });

    it('maps every tapered-pot ring to the same midpoint circumference', () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const expectedMidpointDiameter =
            (DEFAULT_POT.parameters.bottomDiameterMm + DEFAULT_POT.parameters.topDiameterMm) / 2;

        expect(potTexturePerimeter(DEFAULT_POT.parameters)).toBeCloseTo(
            Math.PI * expectedMidpointDiameter,
            12,
        );
        expect(potTexturePerimeter(DEFAULT_POT.parameters)).not.toBeCloseTo(
            Math.PI * DEFAULT_POT.parameters.bottomDiameterMm,
            3,
        );
        expect(potTexturePerimeter(DEFAULT_POT.parameters)).not.toBeCloseTo(
            Math.PI * DEFAULT_POT.parameters.topDiameterMm,
            3,
        );
    });

    it('uses a denser export grid than preview and reports a complexity reduction', () => {
        const noise = createTextureDefault('noise');
        if (noise.kind !== 'noise') throw new Error('Broken texture fixture');
        const dense: DesignConfig = {
            ...DEFAULT_POT,
            texture: { ...noise, scaleMm: 0.6, depthMm: 0.1, octaves: 1, quality: 'high' },
        };
        const preview = planTessellation(dense, 'preview');
        const exported = planTessellation(dense, 'export');
        expect(
            exported.tessellation.circularSegments * exported.tessellation.verticalSegments,
        ).toBeGreaterThanOrEqual(
            preview.tessellation.circularSegments * preview.tessellation.verticalSegments,
        );
        expect(exported.warnings).not.toHaveLength(0);
    });

    it('encodes a valid-length binary STL', async () => {
        const result = await buildGeometry(
            { ...DEFAULT_POT, texture: createTextureDefault('smooth') },
            'draft',
        );
        const stl = encodeBinaryStl(singleMesh(result));
        expect(stl.byteLength).toBe(84 + result.stats.triangleCount * 50);
        expect(new DataView(stl).getUint32(80, true)).toBe(result.stats.triangleCount);
    });

    it('rejects an unsafe drainage layout that passes basic field ranges', async () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const dimensions = { ...DEFAULT_POT.parameters, bottomDiameterMm: 30, topDiameterMm: 30 };
        const config: DesignConfig = {
            ...DEFAULT_POT,
            parameters: {
                ...dimensions,
                drainageHoles: generateDrainageLayout(12, 8, {
                    cavityFloorRadius: cavityFloorRadius(dimensions),
                    wallThicknessMm: dimensions.wallThicknessMm,
                }),
            },
        };
        await expect(buildGeometry(config, 'draft')).rejects.toThrow(/Drainage holes cannot fit/);
    });

    it('preserves full height and places drainage inside the floor cavity for a steep inward taper', async () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const dimensions = {
            ...DEFAULT_POT.parameters,
            heightMm: 30,
            bottomDiameterMm: 300,
            topDiameterMm: 30,
            wallThicknessMm: 0.8,
            bottomThicknessMm: 12,
            edgeTreatment: { style: 'none' as const, sizeMm: 1 },
        };
        const floorRadius = cavityFloorRadius(dimensions);
        const parameters = {
            ...dimensions,
            rigidityRibs: { ...dimensions.rigidityRibs, enabled: false },
            drainageHoles: generateDrainageLayout(2, 2, {
                cavityFloorRadius: floorRadius,
                wallThicknessMm: dimensions.wallThicknessMm,
            }),
        };
        const centers = resolveDrainageHoles(parameters.drainageHoles, {
            cavityFloorRadius: floorRadius,
            wallThicknessMm: parameters.wallThicknessMm,
            bottomThicknessMm: parameters.bottomThicknessMm,
        }).map((hole) => hole.positionMm);
        const result = await buildGeometry(
            { ...DEFAULT_POT, parameters, texture: createTextureDefault('smooth') },
            'draft',
        );
        expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3);
        for (const [x, y] of centers) expect(Math.hypot(x, y) + 1).toBeLessThan(floorRadius);
    });

    it('cuts manual and countersunk holes while ignoring disabled holes', async () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture');
        const manual: DrainageHole = {
            position: { x: 0.25, y: 0 },
            diameterMm: 6,
            shape: 'circle',
            enabled: true,
        };
        const plain = await buildGeometry(
            { ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [manual] } },
            'draft',
        );
        const disabled = await buildGeometry(
            {
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: [{ ...manual, enabled: false }],
                },
            },
            'draft',
        );
        const countersunk = await buildGeometry(
            {
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: [{ ...manual, countersink: { diameterMm: 10, depthMm: 1.5 } }],
                },
            },
            'draft',
        );

        expect(disabled.stats.volumeMm3).toBeGreaterThan(plain.stats.volumeMm3);
        expect(countersunk.stats.volumeMm3).toBeLessThan(plain.stats.volumeMm3);
    });
});

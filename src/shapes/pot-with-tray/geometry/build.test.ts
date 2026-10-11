import { DEFAULT_POT_WITH_TRAY, trayConnectorDimensions } from '../domain/design';
import { createTextureDefault } from '../../../domain/shared/textures';
import { type DesignConfig } from '../../../domain/design';
import { type MeshData } from '../../../domain/worker';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../../../geometry/build';
import { resolveAxialEdgeTreatment } from '../../../geometry/surface/edge-treatment';
import {
    coplanarBottomArea,
    connectedComponentCount,
    hasVertexAtRadiusAndZ,
} from '../../../geometry/testing/mesh';

describe('geometry generation', () => {
    it('builds the pot and tray as separate bed-oriented printable solids', async () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');

        const result = await buildGeometry(
            { ...DEFAULT_POT_WITH_TRAY, texture: createTextureDefault('smooth') },
            'draft',
        );

        expect(result.parts.map((part) => part.kind)).toEqual(['tray', 'pot']);
        expect(result.stats.boundsMm[2]).toBeCloseTo(
            DEFAULT_POT_WITH_TRAY.parameters.heightMm + DEFAULT_POT_WITH_TRAY.tray.heightMm,
            3,
        );
        expect(result.stats.volumeMm3).toBeGreaterThan(0);
        expect(result.stats.triangleCount).toBe(
            result.parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0),
        );
        expect(result.parts[0].previewOffsetMm).toEqual([0, 0, 0]);
        expect(result.parts[1].previewOffsetMm[2]).toBe(
            DEFAULT_POT_WITH_TRAY.tray.heightMm + DEFAULT_POT_WITH_TRAY.tray.previewGapMm,
        );
        for (const part of result.parts) {
            const z = Array.from(part.mesh.positions).filter((_, index) => index % 3 === 2);
            expect(Math.min(...z)).toBeCloseTo(0, 4);
            expect(part.mesh.indices.length).toBeGreaterThan(0);
            expect(coplanarBottomArea(part.mesh)).toBeGreaterThan(1_000);
        }
        const connector = trayConnectorDimensions(
            DEFAULT_POT_WITH_TRAY.parameters,
            DEFAULT_POT_WITH_TRAY.tray,
        );
        const trayPart = result.parts.find((part) => part.kind === 'tray')!;
        const potPart = result.parts.find((part) => part.kind === 'pot')!;
        const trayX = Array.from(trayPart.mesh.positions).filter((_, index) => index % 3 === 0);
        const bottomTreatment = resolveAxialEdgeTreatment(
            DEFAULT_POT_WITH_TRAY.parameters.edgeTreatment,
            {
                bottomWallMm: DEFAULT_POT_WITH_TRAY.tray.wallThicknessMm,
                bottomThicknessMm: DEFAULT_POT_WITH_TRAY.tray.bottomThicknessMm,
                topWallMm: DEFAULT_POT_WITH_TRAY.parameters.wallThicknessMm,
            },
        );
        const beamOuterRadius =
            connector.trayBottomRadiusMm -
            bottomTreatment.bottomSizeMm +
            DEFAULT_POT_WITH_TRAY.bedAdhesionBeams.breakawayDistanceMm +
            DEFAULT_POT_WITH_TRAY.bedAdhesionBeams.lengthMm;
        expect(Math.max(...trayX) - Math.min(...trayX)).toBeCloseTo(beamOuterRadius * 2, 3);
        expect(connectedComponentCount(trayPart.mesh)).toBe(
            DEFAULT_POT_WITH_TRAY.bedAdhesionBeams.count + 1,
        );
        expect(connectedComponentCount(potPart.mesh)).toBe(
            DEFAULT_POT_WITH_TRAY.bedAdhesionBeams.count + 1,
        );
        expect(
            hasVertexAtRadiusAndZ(
                trayPart.mesh,
                connector.tongueInnerRadiusMm,
                DEFAULT_POT_WITH_TRAY.tray.heightMm + connector.tongueHeightMm,
            ),
        ).toBe(true);
        expect(
            hasVertexAtRadiusAndZ(
                trayPart.mesh,
                connector.tongueOuterRadiusMm,
                DEFAULT_POT_WITH_TRAY.tray.heightMm + connector.tongueHeightMm,
            ),
        ).toBe(true);
        expect(
            hasVertexAtRadiusAndZ(
                potPart.mesh,
                connector.grooveInnerRadiusMm,
                DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm,
            ),
        ).toBe(true);
        expect(
            hasVertexAtRadiusAndZ(
                potPart.mesh,
                connector.grooveOuterRadiusMm,
                DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm,
            ),
        ).toBe(true);
    });

    it.each([0, 4, 8] as const)(
        'builds %i configurable breakaway beams on both pot and tray',
        async (count) => {
            if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray')
                throw new Error('Broken tray fixture');
            const config = {
                ...DEFAULT_POT_WITH_TRAY,
                texture: createTextureDefault('smooth'),
                bedAdhesionBeams: {
                    ...DEFAULT_POT_WITH_TRAY.bedAdhesionBeams,
                    count,
                    widthMm: 4.25,
                    lengthMm: 20,
                    modelSideHeightMm: 2,
                    outerSideHeightMm: 4,
                    breakawayDistanceMm: 1,
                },
            };

            const result = await buildGeometry(config, 'draft');

            for (const part of result.parts)
                expect(connectedComponentCount(part.mesh)).toBe(count + 1);
            if (count === 0) return;
            const connector = trayConnectorDimensions(config.parameters, config.tray);
            const bottomTreatment = resolveAxialEdgeTreatment(config.parameters.edgeTreatment, {
                bottomWallMm: config.tray.wallThicknessMm,
                bottomThicknessMm: config.tray.bottomThicknessMm,
                topWallMm: config.parameters.wallThicknessMm,
            });
            const trayContactRadius = connector.trayBottomRadiusMm - bottomTreatment.bottomSizeMm;
            const trayMesh = result.parts.find((part) => part.kind === 'tray')!.mesh;
            const vertices = Array.from({ length: trayMesh.positions.length / 3 }, (_, index) => [
                trayMesh.positions[index * 3],
                trayMesh.positions[index * 3 + 1],
                trayMesh.positions[index * 3 + 2],
            ]);
            const innerTop = vertices.find(
                ([x, y, z]) =>
                    x > trayContactRadius &&
                    Math.abs(Math.abs(y) - 2.125) < 1e-3 &&
                    Math.abs(z - 2) < 1e-3,
            );
            const outerTop = vertices.find(
                ([x, y, z]) =>
                    x > trayContactRadius &&
                    Math.abs(Math.abs(y) - 2.125) < 1e-3 &&
                    Math.abs(z - 4) < 1e-3,
            );
            expect(innerTop).toBeDefined();
            expect(outerTop).toBeDefined();
        },
    );

    it.each([-0.01, -0.1, -0.5])(
        'joins beams to both parts with a %f mm breakaway distance',
        async (breakawayDistanceMm) => {
            if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray')
                throw new Error('Broken tray fixture');
            const config = {
                ...DEFAULT_POT_WITH_TRAY,
                texture: createTextureDefault('smooth'),
                bedAdhesionBeams: {
                    ...DEFAULT_POT_WITH_TRAY.bedAdhesionBeams,
                    modelSideHeightMm: 2,
                    outerSideHeightMm: 4,
                    breakawayDistanceMm,
                },
            };

            const result = await buildGeometry(config, 'draft');

            for (const part of result.parts) expect(connectedComponentCount(part.mesh)).toBe(1);
        },
    );

    it('applies model-side height independently from outer-side height', async () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const base = DEFAULT_POT_WITH_TRAY;
        const buildWithModelSideHeight = (modelSideHeightMm: number) =>
            buildGeometry(
                {
                    ...base,
                    texture: createTextureDefault('smooth'),
                    bedAdhesionBeams: {
                        ...base.bedAdhesionBeams,
                        widthMm: 4.25,
                        modelSideHeightMm,
                        outerSideHeightMm: 4,
                        breakawayDistanceMm: 0.5,
                    },
                },
                'draft',
            );

        const [shortResult, tallResult] = await Promise.all([
            buildWithModelSideHeight(1),
            buildWithModelSideHeight(6),
        ]);
        const modelSideTop = (mesh: MeshData) =>
            Math.max(
                ...Array.from({ length: mesh.positions.length / 3 }, (_, index) => ({
                    x: mesh.positions[index * 3],
                    y: mesh.positions[index * 3 + 1],
                    z: mesh.positions[index * 3 + 2],
                }))
                    .filter(({ x, y }) => x > 45 && x < 60 && Math.abs(Math.abs(y) - 2.125) < 1e-3)
                    .map(({ z }) => z),
            );

        expect(
            modelSideTop(shortResult.parts.find((part) => part.kind === 'tray')!.mesh),
        ).toBeCloseTo(1, 3);
        expect(
            modelSideTop(tallResult.parts.find((part) => part.kind === 'tray')!.mesh),
        ).toBeCloseTo(6, 3);
    });

    it('changes only the pot preview offset when configuring the tray preview gap', async () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const assembled = {
            ...DEFAULT_POT_WITH_TRAY,
            tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 0 },
        };
        const exploded = {
            ...DEFAULT_POT_WITH_TRAY,
            tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 37 },
        };

        const [assembledResult, explodedResult] = await Promise.all([
            buildGeometry(assembled, 'draft'),
            buildGeometry(exploded, 'draft'),
        ]);

        expect(assembledResult.parts.find((part) => part.kind === 'tray')?.previewOffsetMm).toEqual(
            [0, 0, 0],
        );
        expect(assembledResult.parts.find((part) => part.kind === 'pot')?.previewOffsetMm).toEqual([
            0,
            0,
            assembled.tray.heightMm,
        ]);
        expect(explodedResult.parts.find((part) => part.kind === 'pot')?.previewOffsetMm).toEqual([
            0,
            0,
            exploded.tray.heightMm + exploded.tray.previewGapMm,
        ]);
        expect(explodedResult.stats).toEqual(assembledResult.stats);
        expect(explodedResult.parts.map((part) => part.mesh.positions)).toEqual(
            assembledResult.parts.map((part) => part.mesh.positions),
        );
    });

    it('keeps the tray projection flush and applies the requested connector clearance', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const connector = trayConnectorDimensions(
            DEFAULT_POT_WITH_TRAY.parameters,
            DEFAULT_POT_WITH_TRAY.tray,
        );
        const slope =
            (DEFAULT_POT_WITH_TRAY.parameters.topDiameterMm -
                DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm) /
            2 /
            DEFAULT_POT_WITH_TRAY.parameters.heightMm;

        expect(
            connector.trayBottomRadiusMm + slope * DEFAULT_POT_WITH_TRAY.tray.heightMm,
        ).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm / 2, 10);
        expect(connector.grooveOuterRadiusMm - connector.tongueOuterRadiusMm).toBeCloseTo(
            DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm,
            10,
        );
        expect(connector.tongueInnerRadiusMm - connector.grooveInnerRadiusMm).toBeCloseTo(
            DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm,
            10,
        );
        expect(DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm - connector.tongueHeightMm).toBeCloseTo(
            DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm,
            10,
        );
        expect(
            DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm / 2 - connector.grooveOuterRadiusMm,
        ).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.wallThicknessMm, 10);
    });

    it('uses the configured engagement width for the radial tongue and groove', async () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const config: DesignConfig = {
            ...DEFAULT_POT_WITH_TRAY,
            parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, bottomThicknessMm: 6 },
            tray: {
                ...DEFAULT_POT_WITH_TRAY.tray,
                wallThicknessMm: 10,
                engagementWidthMm: 5,
                engagementDepthMm: 5,
            },
            texture: createTextureDefault('smooth'),
        };
        const connector = trayConnectorDimensions(config.parameters, config.tray);

        expect(connector.tongueThicknessMm).toBe(5);
        expect(connector.tongueOuterRadiusMm - connector.tongueInnerRadiusMm).toBeCloseTo(5, 10);
        expect(connector.grooveOuterRadiusMm - connector.grooveInnerRadiusMm).toBeCloseTo(
            5 + 2 * config.tray.fitClearanceMm,
            10,
        );
        expect(config.tray.engagementDepthMm - connector.tongueHeightMm).toBeCloseTo(
            config.tray.fitClearanceMm,
            10,
        );

        const result = await buildGeometry(config, 'draft');
        expect(result.parts).toHaveLength(2);
        expect(
            result.parts.every(
                (part) =>
                    part.mesh.indices.length > 0 &&
                    Array.from(part.mesh.positions).every(Number.isFinite),
            ),
        ).toBe(true);
    });

    it('keeps a fully recessed tray texture clear of the connector groove', async () => {
        const base = createTextureDefault('voronoi');
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray' || base.kind !== 'voronoi')
            throw new Error('Broken tray fixture');
        const texture = {
            ...base,
            scaleMm: 12,
            bottomOffsetPercent: 0,
            topOffsetPercent: 0,
            bottomFadeMm: 0,
            topFadeMm: 0,
            reliefMode: 'recess' as const,
        };

        const result = await buildGeometry({ ...DEFAULT_POT_WITH_TRAY, texture }, 'draft');

        expect(result.parts).toHaveLength(2);
        expect(result.parts.every((part) => part.mesh.indices.length > 0)).toBe(true);
    });
});

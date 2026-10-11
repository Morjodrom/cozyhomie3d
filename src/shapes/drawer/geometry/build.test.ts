import { DEFAULT_DRAWER, type DrawerTextureWalls } from '../domain/design';
import { createTextureDefault } from '../../../domain/shared/textures';
import { type DesignConfig } from '../../../domain/design';
import { describe, expect, it } from 'vitest';
import { buildGeometry } from '../../../geometry/build';
import { buildDrawerRigidityRibMeshes } from './rigidity-ribs';
import { buildDrawerHandleMesh, buildDrawerOuterMesh, drawerHandleBounds } from './mesh';
import { planTessellation } from '../../../geometry/tessellation';
import { intersectionsAlongY, singleMesh } from '../../../geometry/testing/mesh';

describe('geometry generation', () => {
    it('extends both smooth drawer structural axes by the outside projection or gusset', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const extent = Math.max(
            DEFAULT_DRAWER.parameters.rigidityRibs.projectionMm,
            DEFAULT_DRAWER.parameters.rigidityRibs.wallBottomGussetMm,
        );
        const outside = {
            ...DEFAULT_DRAWER.parameters,
            rigidityRibs: {
                ...DEFAULT_DRAWER.parameters.rigidityRibs,
                placement: 'outside' as const,
            },
        };
        const inside = {
            ...outside,
            rigidityRibs: { ...outside.rigidityRibs, placement: 'inside' as const },
        };
        const bounds = (meshes: ReturnType<typeof buildDrawerRigidityRibMeshes>) => {
            const positions = meshes.flatMap((mesh) => Array.from(mesh.positions));
            const axis = (offset: number) =>
                Math.max(...positions.filter((_, index) => index % 3 === offset)) -
                Math.min(...positions.filter((_, index) => index % 3 === offset));
            return [axis(0), axis(1)] as const;
        };
        const [outsideX, outsideY] = bounds(buildDrawerRigidityRibMeshes(outside, 3));
        const [insideX, insideY] = bounds(buildDrawerRigidityRibMeshes(inside, 3));

        expect(insideX).toBeCloseTo(DEFAULT_DRAWER.parameters.widthMm, 6);
        expect(insideY).toBeCloseTo(DEFAULT_DRAWER.parameters.depthMm, 6);
        expect(outsideX - insideX).toBeCloseTo(2 * extent, 6);
        expect(outsideY - insideY).toBeCloseTo(2 * extent, 6);
    });

    it('expands smooth drawer output bounds in both axes for outside rigidity while inside preserves baseline bounds', async () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const rigidityRibs = { ...DEFAULT_DRAWER.parameters.rigidityRibs, wallBottomGussetMm: 20 };
        const base = {
            ...DEFAULT_DRAWER,
            texture: createTextureDefault('smooth'),
            parameters: { ...DEFAULT_DRAWER.parameters, rigidityRibs },
        } as DesignConfig;
        const inside = {
            ...base,
            parameters: {
                ...base.parameters,
                rigidityRibs: { ...base.parameters.rigidityRibs, placement: 'inside' as const },
            },
        } as DesignConfig;
        const outside = {
            ...base,
            parameters: {
                ...base.parameters,
                rigidityRibs: { ...base.parameters.rigidityRibs, placement: 'outside' as const },
            },
        } as DesignConfig;
        const disabled = {
            ...inside,
            parameters: {
                ...inside.parameters,
                rigidityRibs: { ...inside.parameters.rigidityRibs, enabled: false },
            },
        } as DesignConfig;
        const extent = 20;
        const [insideResult, outsideResult, baseline] = await Promise.all([
            buildGeometry(inside, 'draft'),
            buildGeometry(outside, 'draft'),
            buildGeometry(disabled, 'draft'),
        ]);

        insideResult.stats.boundsMm.forEach((value, axis) =>
            expect(value).toBeCloseTo(baseline.stats.boundsMm[axis], 3),
        );
        expect(outsideResult.stats.boundsMm[0]).toBeCloseTo(
            DEFAULT_DRAWER.parameters.widthMm + 2 * extent,
            2,
        );
        expect(outsideResult.stats.boundsMm[1]).toBeCloseTo(
            DEFAULT_DRAWER.parameters.depthMm + 2 * extent,
            2,
        );
    });

    it('keeps configured recessed-handle front rib centerlines while cutting the opening', async () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const parameters = {
            ...DEFAULT_DRAWER.parameters,
            handleStyle: 'recessed' as const,
            handlePositionPercent: 50,
            rigidityRibs: {
                ...DEFAULT_DRAWER.parameters.rigidityRibs,
                frontBackCount: 1,
                sideCount: 0,
            },
        };
        const result = await buildGeometry(
            { ...DEFAULT_DRAWER, parameters, texture: createTextureDefault('smooth') },
            'draft',
        );
        const bounds = drawerHandleBounds(parameters);

        const openingHits = intersectionsAlongY(
            singleMesh(result).positions,
            singleMesh(result).indices,
            0,
            (bounds.openingBottomZMm + bounds.openingTopZMm) / 2,
        );
        expect(Math.min(...openingHits)).toBeGreaterThan(0);

        const ribSegmentHits = intersectionsAlongY(
            singleMesh(result).positions,
            singleMesh(result).indices,
            0,
            bounds.topZMm + 3,
        );
        expect(ribSegmentHits.some((y) => y > -42.5 && y < -40.5)).toBe(true);
    });

    it.each([
        {
            name: 'X',
            xCount: 1,
            yCount: 0,
            boundaryAxis: 0 as const,
            centerAxis: 1 as const,
            boundary: 60,
        },
        {
            name: 'Y',
            xCount: 0,
            yCount: 1,
            boundaryAxis: 1 as const,
            centerAxis: 0 as const,
            boundary: 45,
        },
    ])(
        'runs a $name-direction drawer rib to both footprint edges',
        async ({ xCount, yCount, boundaryAxis, centerAxis, boundary }) => {
            if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
            const config: DesignConfig = {
                ...DEFAULT_DRAWER,
                parameters: {
                    ...DEFAULT_DRAWER.parameters,
                    bottomRibs: { ...DEFAULT_DRAWER.parameters.bottomRibs, xCount, yCount },
                },
                texture: createTextureDefault('smooth'),
            };

            const result = await buildGeometry(config, 'draft');
            const points = Array.from(
                { length: singleMesh(result).positions.length / 3 },
                (_, index) => [
                    singleMesh(result).positions[index * 3],
                    singleMesh(result).positions[index * 3 + 1],
                    singleMesh(result).positions[index * 3 + 2],
                ],
            );

            for (const sign of [-1, 1]) {
                expect(
                    points.some(
                        (point) =>
                            Math.abs(point[boundaryAxis] - sign * boundary) < 0.01 &&
                            Math.abs(point[centerAxis]) < 0.01 &&
                            Math.abs(point[2] - DEFAULT_DRAWER.parameters.bottomRibs.depthMm) <
                                0.01,
                    ),
                ).toBe(true);
            }
        },
    );

    it('builds the default drawer with its attached handle projection', async () => {
        const result = await buildGeometry(DEFAULT_DRAWER, 'draft');
        expect(result.stats.volumeMm3).toBeGreaterThan(0);
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        expect(result.stats.boundsMm[0]).toBeGreaterThanOrEqual(DEFAULT_DRAWER.parameters.widthMm);
        expect(result.stats.boundsMm[1]).toBeGreaterThan(DEFAULT_DRAWER.parameters.depthMm);
        expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3);
    });

    it('lets drawer body corners reach a maximum larger than its wall treatment', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const parameters = {
            ...DEFAULT_DRAWER.parameters,
            edgeTreatment: { style: 'rounded' as const, sizeMm: 20 },
        };

        const mesh = buildDrawerOuterMesh(
            parameters,
            createTextureDefault('smooth'),
            DEFAULT_DRAWER.textureWalls,
            {
                circularSegments: 24,
                drawerSideSegments: 8,
                verticalSegments: 8,
                edgeSegments: 3,
            },
        );
        const sidePointsAboveBottomTreatment = Array.from(
            { length: mesh.positions.length / 3 },
            (_, index) => ({
                x: mesh.positions[index * 3],
                y: mesh.positions[index * 3 + 1],
                z: mesh.positions[index * 3 + 2],
            }),
        ).filter(
            (point) =>
                Math.abs(point.x - parameters.widthMm / 2) < 1e-6 &&
                Math.abs(point.z - parameters.wallThicknessMm / 2) < 1e-6,
        );

        expect(Math.min(...sidePointsAboveBottomTreatment.map((point) => point.y))).toBeCloseTo(
            -parameters.depthMm / 2 + 20,
            6,
        );
    });

    it.each([
        { position: 0, expectedBottom: 38, expectedTop: 50 },
        { position: 50, expectedBottom: 19, expectedTop: 31 },
        { position: 100, expectedBottom: 0, expectedTop: 12 },
    ])(
        'positions the projecting handle at $position%',
        ({ position, expectedBottom, expectedTop }) => {
            if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
            const parameters = { ...DEFAULT_DRAWER.parameters, handlePositionPercent: position };
            const bounds = drawerHandleBounds(parameters);
            const mesh = buildDrawerHandleMesh(parameters);
            const zValues = Array.from(mesh.positions).filter((_, index) => index % 3 === 2);

            expect(bounds.bottomZMm).toBeCloseTo(expectedBottom, 6);
            expect(bounds.topZMm).toBeCloseTo(expectedTop, 6);
            expect(Math.min(...zValues)).toBeCloseTo(expectedBottom, 6);
            expect(Math.max(...zValues)).toBeCloseTo(expectedTop, 6);
        },
    );

    it.each([
        { position: 0, expectedBottom: 34, expectedTop: 50 },
        { position: 50, expectedBottom: 17, expectedTop: 33 },
        { position: 100, expectedBottom: 0, expectedTop: 16 },
    ])(
        'positions the complete reinforced opening at $position%',
        ({ position, expectedBottom, expectedTop }) => {
            if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
            const parameters = {
                ...DEFAULT_DRAWER.parameters,
                handleStyle: 'recessed' as const,
                handlePositionPercent: position,
            };

            const bounds = drawerHandleBounds(parameters);

            expect(bounds.bottomZMm).toBeCloseTo(expectedBottom, 6);
            expect(bounds.topZMm).toBeCloseTo(expectedTop, 6);
            expect(bounds.openingBottomZMm).toBeCloseTo(
                expectedBottom + parameters.wallThicknessMm,
                6,
            );
            expect(bounds.openingTopZMm).toBeCloseTo(expectedTop - parameters.wallThicknessMm, 6);
        },
    );

    it('builds an unbacked through-hole with reinforcing ribs on both front-wall faces', async () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const parameters = {
            ...DEFAULT_DRAWER.parameters,
            handleStyle: 'recessed' as const,
            handlePositionPercent: 50,
        };
        const config: DesignConfig = {
            ...DEFAULT_DRAWER,
            parameters,
            texture: createTextureDefault('smooth'),
        };

        const result = await buildGeometry(config, 'draft');

        expect(result.stats.boundsMm[1]).toBeCloseTo(
            parameters.depthMm + parameters.wallThicknessMm,
            3,
        );
        expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3);
        expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);

        const bounds = drawerHandleBounds(parameters);
        const centerZ = (bounds.openingBottomZMm + bounds.openingTopZMm) / 2;
        const frontRibY = -parameters.depthMm / 2 - parameters.wallThicknessMm;
        const innerRibY =
            -parameters.depthMm / 2 + parameters.wallThicknessMm + parameters.handleDepthMm;
        const yValues = Array.from(singleMesh(result).positions).filter(
            (_, index) => index % 3 === 1,
        );
        expect(yValues.some((y) => Math.abs(y - frontRibY) < 0.01)).toBe(true);
        expect(yValues.some((y) => Math.abs(y - innerRibY) < 0.01)).toBe(true);

        const centerRayHits = intersectionsAlongY(
            singleMesh(result).positions,
            singleMesh(result).indices,
            0,
            centerZ,
        );
        expect(centerRayHits.length).toBeGreaterThan(0);
        expect(Math.min(...centerRayHits)).toBeGreaterThan(0);
    });

    it.each([
        { name: 'square at top', radius: 0, position: 0 },
        { name: 'rounded at center', radius: 3, position: 50 },
        { name: 'maximum radius at bottom', radius: 6, position: 100 },
    ])('builds a connected $name reinforced opening', async ({ radius, position }) => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const parameters = {
            ...DEFAULT_DRAWER.parameters,
            handleStyle: 'recessed' as const,
            handleCornerRadiusMm: radius,
            handlePositionPercent: position,
        };

        const result = await buildGeometry({ ...DEFAULT_DRAWER, parameters }, 'draft');

        expect(result.stats.volumeMm3).toBeGreaterThan(0);
        expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
    });

    it.each(['projecting', 'recessed'] as const)(
        'builds a connected textured drawer with a %s handle away from the top edge',
        async (handleStyle) => {
            if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
            const config: DesignConfig = {
                ...DEFAULT_DRAWER,
                parameters: {
                    ...DEFAULT_DRAWER.parameters,
                    handleStyle,
                    handlePositionPercent: 75,
                },
            };

            const result = await buildGeometry(config, 'draft');

            expect(result.stats.volumeMm3).toBeGreaterThan(0);
            expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
        },
    );

    it.each([
        {
            name: 'front only',
            walls: { front: true, sides: false, back: false },
            textured: ['front'],
        },
        {
            name: 'sides only',
            walls: { front: false, sides: true, back: false },
            textured: ['right', 'left'],
        },
        {
            name: 'back only',
            walls: { front: false, sides: false, back: true },
            textured: ['back'],
        },
        {
            name: 'all walls',
            walls: { front: true, sides: true, back: true },
            textured: ['right', 'back', 'left', 'front'],
        },
    ] as const)('applies drawer texture to $name', ({ walls, textured }) => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const sideSegments = 8;
        const verticalSegments = 8;
        const texture = createTextureDefault('noise');
        const mesh = buildDrawerOuterMesh(
            { ...DEFAULT_DRAWER.parameters, edgeTreatment: { style: 'none', sizeMm: 1 } },
            texture,
            walls,
            { circularSegments: 24, drawerSideSegments: sideSegments, verticalSegments },
        );
        const loopSize = sideSegments * 4;
        const halfWidth = DEFAULT_DRAWER.parameters.widthMm / 2;
        const halfDepth = DEFAULT_DRAWER.parameters.depthMm / 2;
        const displacement = { right: 0, back: 0, left: 0, front: 0 };

        for (let ring = 1; ring < verticalSegments; ring += 1) {
            for (let step = 1; step < sideSegments; step += 1) {
                const coordinate = (wall: number, axis: 0 | 1) =>
                    mesh.positions[(ring * loopSize + wall * sideSegments + step) * 3 + axis];
                displacement.right = Math.max(
                    displacement.right,
                    Math.abs(coordinate(0, 0) - halfWidth),
                );
                displacement.back = Math.max(
                    displacement.back,
                    Math.abs(coordinate(1, 1) - halfDepth),
                );
                displacement.left = Math.max(
                    displacement.left,
                    Math.abs(coordinate(2, 0) + halfWidth),
                );
                displacement.front = Math.max(
                    displacement.front,
                    Math.abs(coordinate(3, 1) + halfDepth),
                );
            }
        }

        for (const wall of Object.keys(displacement) as Array<keyof typeof displacement>) {
            if ((textured as readonly string[]).includes(wall))
                expect(displacement[wall]).toBeGreaterThan(0.01);
            else expect(displacement[wall]).toBeCloseTo(0, 6);
        }
    });

    it('uses smooth mesh density when every drawer texture wall is disabled', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const textureWalls: DrawerTextureWalls = { front: false, sides: false, back: false };
        const config: DesignConfig = {
            ...DEFAULT_DRAWER,
            parameters: {
                ...DEFAULT_DRAWER.parameters,
                edgeTreatment: { style: 'none', sizeMm: 1 },
            },
            textureWalls,
        };
        const tessellation = { circularSegments: 24, drawerSideSegments: 8, verticalSegments: 20 };

        const plan = planTessellation(config, 'preview');
        const mesh = buildDrawerOuterMesh(
            config.parameters,
            config.texture,
            textureWalls,
            tessellation,
        );

        expect(plan.warnings).toEqual([]);
        expect(plan.tessellation).toEqual({
            circularSegments: 72,
            verticalSegments: 16,
            drawerSideSegments: 36,
            edgeSegments: 5,
        });
        expect(mesh.positions.length).toBe((2 * tessellation.drawerSideSegments * 4 + 2) * 3);
    });

    it.each(['ribs', 'honeycomb', 'voronoi', 'fractal'] as const)(
        'applies vector %s relief in both directions without falling back to the sampled shell',
        async (kind) => {
            const base = createTextureDefault(kind);
            if (base.kind === 'smooth') throw new Error('Broken texture fixture');
            const texture =
                base.kind === 'ribs'
                    ? {
                          ...base,
                          scaleMm: Math.max(12, base.scaleMm),
                          depthMm: 0.5,
                          bottomOffsetPercent: 20,
                          topOffsetPercent: 20,
                      }
                    : {
                          ...base,
                          scaleMm: Math.max(12, base.scaleMm),
                          depthMm: 0.5,
                          bottomOffsetPercent: 20,
                          topOffsetPercent: 20,
                          bottomFadeMm: 0,
                          topFadeMm: 0,
                      };
            const smooth = await buildGeometry(
                { ...DEFAULT_DRAWER, texture: createTextureDefault('smooth') },
                'draft',
            );

            const embossed = await buildGeometry(
                { ...DEFAULT_DRAWER, texture: { ...texture, reliefMode: 'emboss' } },
                'draft',
            );
            const recessed = await buildGeometry(
                { ...DEFAULT_DRAWER, texture: { ...texture, reliefMode: 'recess' } },
                'draft',
            );

            expect(embossed.stats.volumeMm3).toBeGreaterThan(smooth.stats.volumeMm3);
            expect(recessed.stats.volumeMm3).toBeLessThan(smooth.stats.volumeMm3);
        },
    );

    it('warns when fractal root density is reduced by the vector budget', () => {
        if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture');
        const base = createTextureDefault('fractal');
        if (base.kind !== 'fractal') throw new Error('Broken fractal fixture');
        const config: DesignConfig = {
            ...DEFAULT_DRAWER,
            parameters: { ...DEFAULT_DRAWER.parameters, widthMm: 400, depthMm: 400, heightMm: 250 },
            texture: { ...base, scaleMm: 20, branchWidthMm: 3, levels: 6 },
        };

        expect(planTessellation(config, 'preview').warnings).toContain(
            'Fractal branch density was reduced to keep the mesh below the export complexity limit.',
        );
    });
});

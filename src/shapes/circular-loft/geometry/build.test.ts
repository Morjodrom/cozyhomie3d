import { describe, expect, it } from 'vitest';
import { type DesignConfig } from '../../../domain/design';
import { buildGeometry } from '../../../geometry/build';
import { connectedComponentCount, singleMesh } from '../../../geometry/testing/mesh';
import { DEFAULT_CIRCULAR_LOFT } from '../domain/design';

function loftConfig(
    parameters: Extract<DesignConfig, { type: 'circular-loft' }>['parameters'],
): Extract<DesignConfig, { type: 'circular-loft' }> {
    return { type: 'circular-loft', parameters };
}

function hasOnlyNonDegenerateTriangles(mesh: ReturnType<typeof singleMesh>): boolean {
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
        const a = mesh.indices[offset] * 3;
        const b = mesh.indices[offset + 1] * 3;
        const c = mesh.indices[offset + 2] * 3;
        const ab = [
            mesh.positions[b] - mesh.positions[a],
            mesh.positions[b + 1] - mesh.positions[a + 1],
            mesh.positions[b + 2] - mesh.positions[a + 2],
        ];
        const ac = [
            mesh.positions[c] - mesh.positions[a],
            mesh.positions[c + 1] - mesh.positions[a + 1],
            mesh.positions[c + 2] - mesh.positions[a + 2],
        ];
        const doubledArea = Math.hypot(
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        );
        if (doubledArea < 1e-8) return false;
    }
    return true;
}

function isWatertight(mesh: ReturnType<typeof singleMesh>): boolean {
    const edgeCounts = new Map<string, number>();
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
        const triangle = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
        for (let index = 0; index < triangle.length; index += 1) {
            const a = triangle[index];
            const b = triangle[(index + 1) % triangle.length];
            const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
            edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
        }
    }
    return [...edgeCounts.values()].every((count) => count === 2);
}

describe('circular-loft geometry', () => {
    it('builds the default cylinder at every quality', async () => {
        for (const quality of ['draft', 'preview', 'export'] as const) {
            const result = await buildGeometry(DEFAULT_CIRCULAR_LOFT, quality);

            expect(result.parts).toHaveLength(1);
            expect(result.parts[0].kind).toBe('circular-loft');
            expect(result.stats.boundsMm[2]).toBeCloseTo(60, 3);
            expect(result.stats.volumeMm3).toBeGreaterThan(0);
            expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true);
        }
    });

    it('subtracts a void zone and adds alternating third and fourth-circle material zones', async () => {
        const twoCircles = loftConfig({
            sections: [
                {
                    circles: [
                        { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        { diameterMm: 40, offsetDistanceMm: 3, offsetAngleDeg: 90 },
                    ],
                },
                {
                    circles: [
                        { diameterMm: 100, offsetDistanceMm: 4, offsetAngleDeg: 90 },
                        { diameterMm: 50, offsetDistanceMm: 5, offsetAngleDeg: 90 },
                    ],
                },
            ],
            gapsMm: [40],
        });
        const fourCircles = loftConfig({
            ...twoCircles.parameters,
            sections: twoCircles.parameters.sections.map((section) => ({
                circles: [
                    ...section.circles,
                    {
                        diameterMm: 20,
                        offsetDistanceMm: section.circles[1].offsetDistanceMm,
                        offsetAngleDeg: section.circles[1].offsetAngleDeg,
                    },
                    {
                        diameterMm: 8,
                        offsetDistanceMm: section.circles[1].offsetDistanceMm,
                        offsetAngleDeg: section.circles[1].offsetAngleDeg,
                    },
                ],
            })),
        });

        for (const quality of ['draft', 'preview', 'export'] as const) {
            const tube = await buildGeometry(twoCircles, quality);
            const alternating = await buildGeometry(fourCircles, quality);

            expect(tube.stats.volumeMm3).toBeGreaterThan(0);
            expect(alternating.stats.volumeMm3).toBeGreaterThan(tube.stats.volumeMm3);
            expect(connectedComponentCount(singleMesh(alternating))).toBe(2);
        }
    });

    it('builds a three-circle cylinder with alternating tube and core material', async () => {
        const result = await buildGeometry(
            loftConfig({
                sections: [
                    {
                        circles: [
                            { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        ],
                    },
                    {
                        circles: [
                            { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            { diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        ],
                    },
                ],
                gapsMm: [30],
            }),
            'draft',
        );
        const mesh = singleMesh(result);
        const analyticVolumeMm3 = Math.PI * (40 ** 2 - 20 ** 2 + 10 ** 2) * 30;

        expect(result.stats.volumeMm3).toBeGreaterThan(analyticVolumeMm3 * 0.99);
        expect(result.stats.volumeMm3).toBeLessThan(analyticVolumeMm3 * 1.01);
        expect(connectedComponentCount(mesh)).toBe(2);
        expect(hasOnlyNonDegenerateTriangles(mesh)).toBe(true);
        expect(Array.from(mesh.normals).every(Number.isFinite)).toBe(true);
        expect(
            Array.from(mesh.normals).every(
                (value, index, normals) =>
                    index % 3 !== 0 ||
                    Math.hypot(value, normals[index + 1], normals[index + 2]) > 0.99,
            ),
        ).toBe(true);
    });

    it.each([
        { name: 'point-to-circle', lowerVoidDiameterMm: 0, upperVoidDiameterMm: 40 },
        { name: 'circle-to-point', lowerVoidDiameterMm: 40, upperVoidDiameterMm: 0 },
    ])(
        'cuts a shifted deepest-void cone without degenerate triangles for $name',
        async ({ lowerVoidDiameterMm, upperVoidDiameterMm }) => {
            const config = loftConfig({
                sections: [
                    {
                        circles: [
                            { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            {
                                diameterMm: lowerVoidDiameterMm,
                                offsetDistanceMm: 8.06225774829855,
                                offsetAngleDeg: 119.74488129694225,
                            },
                        ],
                    },
                    {
                        circles: [
                            { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                            {
                                diameterMm: upperVoidDiameterMm,
                                offsetDistanceMm: 5.8309518948453,
                                offsetAngleDeg: 300.9637565320735,
                            },
                        ],
                    },
                ],
                gapsMm: [30],
            });
            const analyticVolumeMm3 = Math.PI * (40 ** 2 - 20 ** 2 / 3) * 30;

            for (const quality of ['draft', 'preview', 'export'] as const) {
                const result = await buildGeometry(config, quality);
                const mesh = singleMesh(result);

                expect(result.stats.volumeMm3).toBeGreaterThan(analyticVolumeMm3 * 0.99);
                expect(result.stats.volumeMm3).toBeLessThan(analyticVolumeMm3 * 1.01);
                expect(hasOnlyNonDegenerateTriangles(mesh)).toBe(true);
                expect(isWatertight(mesh)).toBe(true);
                expect(Array.from(mesh.normals).every(Number.isFinite)).toBe(true);
            }
        },
    );

    it('ignores a zero-to-zero deepest void just like the same loft without that boundary', async () => {
        const sections = Array.from({ length: 2 }, () => ({
            circles: [
                { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 70, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                { diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 },
            ],
        }));
        const withoutZeroVoid = loftConfig({ sections, gapsMm: [30] });
        const withZeroVoid = loftConfig({
            sections: sections.map((section) => ({
                circles: [
                    ...section.circles,
                    {
                        diameterMm: 0,
                        offsetDistanceMm: 11.180339887498949,
                        offsetAngleDeg: 116.56505117707798,
                    },
                ],
            })),
            gapsMm: [30],
        });

        for (const quality of ['draft', 'preview', 'export'] as const) {
            const baseline = await buildGeometry(withoutZeroVoid, quality);
            const skippedVoid = await buildGeometry(withZeroVoid, quality);

            expect(skippedVoid.stats.volumeMm3).toBeCloseTo(baseline.stats.volumeMm3, 8);
            expect(skippedVoid.stats.triangleCount).toBe(baseline.stats.triangleCount);
            expect(connectedComponentCount(singleMesh(skippedVoid))).toBe(2);
        }
    });

    it('allows a deepest cavity to close and restart through point-contact boundaries', async () => {
        const outerCircle = { diameterMm: 80, offsetDistanceMm: 0, offsetAngleDeg: 0 };
        const closesInside = loftConfig({
            sections: [0, 0, 20, 20].map((diameterMm) => ({
                circles: [outerCircle, { diameterMm, offsetDistanceMm: 6, offsetAngleDeg: 90 }],
            })),
            gapsMm: [10, 10, 10],
        });
        const restartsAtPoint = loftConfig({
            sections: [20, 0, 20, 20].map((diameterMm) => ({
                circles: [outerCircle, { diameterMm, offsetDistanceMm: 6, offsetAngleDeg: 90 }],
            })),
            gapsMm: [10, 10, 10],
        });

        const closed = await buildGeometry(closesInside, 'export');
        const restarted = await buildGeometry(restartsAtPoint, 'export');

        expect(closed.stats.volumeMm3).toBeGreaterThan(0);
        expect(restarted.stats.volumeMm3).toBeGreaterThan(0);
        expect(isWatertight(singleMesh(closed))).toBe(true);
        expect(isWatertight(singleMesh(restarted))).toBe(true);
    });

    it('creates a zero-length internal step without material at the repeated z level', async () => {
        const config = loftConfig({
            sections: [
                { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
            ],
            gapsMm: [30, 0, 30],
        });

        for (const quality of ['draft', 'preview', 'export'] as const) {
            const result = await buildGeometry(config, quality);

            expect(result.stats.boundsMm[2]).toBeCloseTo(60, 3);
            expect(result.stats.volumeMm3).toBeGreaterThan(0);
        }
    });

    it('allows disconnected material components across a zero-length step', async () => {
        const result = await buildGeometry(
            loftConfig({
                sections: [
                    { circles: [{ diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                    { circles: [{ diameterMm: 40, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                    { circles: [{ diameterMm: 40, offsetDistanceMm: 100, offsetAngleDeg: 90 }] },
                    { circles: [{ diameterMm: 40, offsetDistanceMm: 100, offsetAngleDeg: 90 }] },
                ],
                gapsMm: [20, 0, 20],
            }),
            'draft',
        );

        expect(connectedComponentCount(singleMesh(result))).toBe(2);
    });

    it('keeps small positive intervals valid and rejects complexity before loading geometry', async () => {
        const smallGap = loftConfig({
            sections: [
                { circles: [{ diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                { circles: [{ diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
            ],
            gapsMm: [0.01],
        });
        const sections = Array.from({ length: 258 }, () => ({
            circles: [{ diameterMm: 20, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
        }));
        const overBudget = loftConfig({ sections, gapsMm: Array(257).fill(1) });
        const rawTriangleOverBudget = loftConfig({
            sections: Array.from({ length: 101 }, () => ({
                circles: [
                    { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                    { diameterMm: 99.998, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                ],
            })),
            gapsMm: Array(100).fill(1),
        });

        await expect(buildGeometry(smallGap, 'draft')).resolves.toMatchObject({
            stats: { volumeMm3: expect.any(Number) },
        });
        await expect(buildGeometry(overBudget, 'draft')).rejects.toThrow(
            /257 generated boolean operands/,
        );
        await expect(buildGeometry(rawTriangleOverBudget, 'draft')).rejects.toThrow(
            /raw triangles before booleans/,
        );
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildGeometry } from '../../../geometry/build';
import { getManifoldModule } from '../../../geometry/engine/manifold';
import { planTessellation } from '../../../geometry/tessellation';
import { connectedComponentCount, singleMesh, triangleArea } from '../../../geometry/testing/mesh';
import { DEFAULT_CIRCULAR_LOFT, type CircularLoftConfig } from '../domain/design';
import { appendCircularLoftCircle } from '../domain/operations';
import { buildCircularLoft } from './build';

afterEach(() => vi.restoreAllMocks());

describe('circular-loft regression safety', () => {
    it('preserves an eccentric near-touching void through adaptive sampling', async () => {
        const config: CircularLoftConfig = {
            type: 'circular-loft',
            parameters: {
                sections: Array.from({ length: 2 }, () => ({
                    circles: [
                        { diameterMm: 100, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        { diameterMm: 80, offsetDistanceMm: 9.999, offsetAngleDeg: 90 },
                    ],
                })),
                gapsMm: [20],
            },
        };

        const result = await buildGeometry(config, 'draft');
        const expectedVolume = Math.PI * (50 ** 2 - 40 ** 2) * 20;

        expect(connectedComponentCount(singleMesh(result))).toBe(1);
        expect(result.stats.volumeMm3 / expectedVolume).toBeCloseTo(1, 3);
        expect(result.stats.triangleCount).toBeGreaterThan(48 * 4);
    });
    it.each([
        { name: 'contraction', lowerDiameter: 60, upperDiameter: 40 },
        { name: 'expansion', lowerDiameter: 40, upperDiameter: 60 },
        { name: 'identical contours', lowerDiameter: 60, upperDiameter: 60 },
    ])('removes internal torces for a $name step', async ({ lowerDiameter, upperDiameter }) => {
        const config: CircularLoftConfig = {
            type: 'circular-loft',
            parameters: {
                sections: [lowerDiameter, lowerDiameter, upperDiameter, upperDiameter].map(
                    (diameterMm) => ({
                        circles: [{ diameterMm, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
                    }),
                ),
                gapsMm: [30, 0, 30],
            },
        };

        const result = await buildGeometry(config, 'export');
        const mesh = singleMesh(result);
        const horizontalIndices: number[] = [];
        for (let offset = 0; offset < mesh.indices.length; offset += 3) {
            const indices = Array.from(mesh.indices.slice(offset, offset + 3));
            if (indices.every((index) => Math.abs(mesh.positions[index * 3 + 2] - 30) < 1e-5))
                horizontalIndices.push(...indices);
        }
        const expectedVolume = (Math.PI * (lowerDiameter ** 2 + upperDiameter ** 2) * 30) / 4;
        const expectedStepArea = (Math.PI * Math.abs(lowerDiameter ** 2 - upperDiameter ** 2)) / 4;
        const area = triangleArea(mesh.positions, new Uint32Array(horizontalIndices));

        expect(connectedComponentCount(mesh)).toBe(1);
        expect(result.stats.volumeMm3 / expectedVolume).toBeCloseTo(1, 2);
        if (expectedStepArea === 0) expect(area).toBe(0);
        else expect(area / expectedStepArea).toBeCloseTo(1, 2);
    });

    it('rejects an unrepresentable interval instead of silently omitting it', async () => {
        const config: CircularLoftConfig = {
            type: 'circular-loft',
            parameters: {
                sections: Array.from({ length: 3 }, () => ({
                    circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
                })),
                gapsMm: [100_000_000, 1],
            },
        };

        await expect(buildGeometry(config, 'draft')).rejects.toThrow(/mesh precision/);
    });

    it('rejects coordinates that overflow mesh buffers before invoking Manifold', async () => {
        const config: CircularLoftConfig = {
            ...DEFAULT_CIRCULAR_LOFT,
            parameters: {
                ...DEFAULT_CIRCULAR_LOFT.parameters,
                sections: Array.from({ length: 2 }, () => ({
                    circles: [
                        {
                            diameterMm: 60,
                            offsetDistanceMm: 10000000000000000159028911097599180468360808563945281389781327557747838772170381060813469985856815104,
                            offsetAngleDeg: 90,
                        },
                    ],
                })),
            },
        };

        await expect(buildGeometry(config, 'draft')).rejects.toThrow(/numeric range/);
    });

    it('does not allocate or leak a placeholder for a skipped zero-to-zero deepest void', async () => {
        const module = await getManifoldModule();
        const config: CircularLoftConfig = {
            type: 'circular-loft',
            parameters: {
                sections: Array.from({ length: 2 }, () => ({
                    circles: [
                        { diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 },
                        {
                            diameterMm: 0,
                            offsetDistanceMm: 8.54400374531753,
                            offsetAngleDeg: 110.55604521958344,
                        },
                    ],
                })),
                gapsMm: [30],
            },
        };
        const handles: Manifold[] = [];
        const deletes: ReturnType<typeof vi.spyOn>[] = [];
        const ofMesh = module.Manifold.ofMesh.bind(module.Manifold);
        vi.spyOn(module.Manifold, 'ofMesh').mockImplementation((mesh) => {
            const handle = ofMesh(mesh);
            handles.push(handle);
            deletes.push(vi.spyOn(handle, 'delete'));
            return handle;
        });

        const result = buildCircularLoft(
            module,
            config,
            planTessellation(config, 'draft').tessellation,
        );
        result.delete();

        expect(handles).toHaveLength(1);
        for (const deletion of deletes) expect(deletion).toHaveBeenCalledTimes(1);
    });

    it.each([
        'mesh creation',
        'volume evaluation',
        'boolean construction',
        'boolean evaluation',
    ] as const)('deletes each intermediate exactly once after failed %s', async (failure) => {
        const module = await getManifoldModule();
        const config: CircularLoftConfig = {
            ...DEFAULT_CIRCULAR_LOFT,
            parameters: appendCircularLoftCircle(
                appendCircularLoftCircle(DEFAULT_CIRCULAR_LOFT.parameters),
            ),
        };
        const handles: Manifold[] = [];
        const deletes: ReturnType<typeof vi.spyOn>[] = [];
        const ofMesh = module.Manifold.ofMesh.bind(module.Manifold);
        vi.spyOn(module.Manifold, 'ofMesh').mockImplementation((mesh) => {
            if (failure === 'mesh creation' && handles.length === 1)
                throw new Error('Injected mesh creation failure.');
            const handle = ofMesh(mesh);
            handles.push(handle);
            deletes.push(vi.spyOn(handle, 'delete'));
            if (failure === 'volume evaluation') {
                vi.spyOn(handle, 'volume').mockImplementation(() => {
                    throw new Error('Injected volume evaluation failure.');
                });
            }
            return handle;
        });
        if (failure === 'boolean construction') {
            vi.spyOn(module.Manifold, 'difference').mockImplementation(() => {
                throw new Error('Injected boolean construction failure.');
            });
        } else if (failure === 'boolean evaluation') {
            const difference = module.Manifold.difference.bind(module.Manifold);
            vi.spyOn(module.Manifold, 'difference').mockImplementation((inputs) => {
                const result = difference(inputs);
                handles.push(result);
                deletes.push(vi.spyOn(result, 'delete'));
                vi.spyOn(result, 'status').mockImplementation(() => {
                    throw new Error('Injected boolean evaluation failure.');
                });
                return result;
            });
        }

        expect(() =>
            buildCircularLoft(module, config, planTessellation(config, 'draft').tessellation),
        ).toThrow(/Injected/);

        expect(handles.length).toBeGreaterThan(0);
        for (const deletion of deletes) expect(deletion).toHaveBeenCalledTimes(1);
    });
});

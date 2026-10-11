import type { DesignConfig } from '../../../domain/design';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    evaluateAndDisposeInputs,
    manifoldFromRaw,
    unionManifoldsInBatches,
} from '../../../geometry/engine/operations';
import type { Tessellation } from '../../../geometry/mesh/types';
import { buildCircularLoftIntervalMesh } from './mesh';

function buildIntervalMaterial(
    module: ManifoldToplevel,
    config: Extract<DesignConfig, { type: 'circular-loft' }>,
    intervalIndex: number,
    lowerZMm: number,
    upperZMm: number,
    tessellation: Tessellation,
): Manifold {
    const lower = config.parameters.sections[intervalIndex]!;
    const upper = config.parameters.sections[intervalIndex + 1]!;
    let material: Manifold | undefined;
    try {
        for (let circleIndex = 0; circleIndex < lower.circles.length; circleIndex += 1) {
            const lowerCircle = lower.circles[circleIndex];
            const upperCircle = upper.circles[circleIndex];
            const raw = buildCircularLoftIntervalMesh(
                lowerCircle,
                upperCircle,
                lowerZMm,
                upperZMm,
                tessellation.circularSegments,
            );
            if (!raw) {
                const isDeepestVoid =
                    circleIndex === lower.circles.length - 1 && circleIndex % 2 === 1;
                if (!isDeepestVoid)
                    throw new Error('Only a deepest zero-diameter void may be omitted.');
                continue;
            }
            const volume = manifoldFromRaw(module, raw);
            try {
                const volumeMm3 = volume.volume();
                if (volume.isEmpty() || !Number.isFinite(volumeMm3) || volumeMm3 <= 0) {
                    throw new Error(
                        `Section interval ${intervalIndex + 1}, circle ${circleIndex + 1} cannot be represented at mesh precision; adjust its dimensions or coordinates.`,
                    );
                }
            } catch (error) {
                volume.delete();
                throw error;
            }
            if (!material) {
                if (circleIndex !== 0) {
                    volume.delete();
                    throw new Error('Circular loft interval has no material boundary.');
                }
                material = volume;
                continue;
            }
            const zone = volume;
            const inputs = [material, zone];
            material = undefined;
            let result: Manifold;
            try {
                result =
                    circleIndex % 2 === 1
                        ? module.Manifold.difference(inputs)
                        : module.Manifold.union(inputs);
            } catch (error) {
                for (const input of inputs) input.delete();
                throw error;
            }
            material = evaluateAndDisposeInputs(result, inputs);
            const materialVolumeMm3 = material.volume();
            if (
                material.isEmpty() ||
                !Number.isFinite(materialVolumeMm3) ||
                materialVolumeMm3 <= 0
            ) {
                throw new Error(
                    'Nested circular-loft boundaries collapse at mesh precision; increase their clearance.',
                );
            }
        }
        if (!material) throw new Error('Circular loft interval has no material boundary.');
        return material;
    } catch (error) {
        material?.delete();
        throw error;
    }
}

export function buildCircularLoft(
    module: ManifoldToplevel,
    config: Extract<DesignConfig, { type: 'circular-loft' }>,
    tessellation: Tessellation,
): Manifold {
    const intervals: Manifold[] = [];
    let zMm = 0;
    try {
        for (
            let intervalIndex = 0;
            intervalIndex < config.parameters.gapsMm.length;
            intervalIndex += 1
        ) {
            const gapMm = config.parameters.gapsMm[intervalIndex];
            const upperZMm = zMm + gapMm;
            if (gapMm > 0)
                intervals.push(
                    buildIntervalMaterial(
                        module,
                        config,
                        intervalIndex,
                        zMm,
                        upperZMm,
                        tessellation,
                    ),
                );
            zMm = upperZMm;
        }
        if (!intervals.length) throw new Error('Circular loft has no material intervals.');
        return unionManifoldsInBatches(module, intervals.splice(0));
    } catch (error) {
        for (const interval of intervals) interval.delete();
        throw error;
    }
}

export function validateCircularLoft(manifold: Manifold): void {
    if (manifold.status() !== 'NoError')
        throw new Error('Generated circular loft is not manifold.');
    if (manifold.isEmpty() || !Number.isFinite(manifold.volume()) || manifold.volume() <= 0)
        throw new Error('Generated model is empty or has invalid volume.');
}

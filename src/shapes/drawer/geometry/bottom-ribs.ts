import { rotateAndDelete, translateAndDelete } from '../../../geometry/engine/transforms';
import type { BuildQuality } from '../../../domain/worker';
import type { DrawerParameters } from '../domain/design';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    grooveAlongY,
    CURVE_SEGMENTS,
    evenlySpacedCenterlines,
} from '../../../geometry/features/bottom-ribs';

export function buildDrawerBottomRibCutters(
    module: ManifoldToplevel,
    parameters: DrawerParameters,
    quality: BuildQuality,
): Manifold[] {
    const ribs = parameters.bottomRibs;
    if (!ribs.enabled) return [];
    const curveSegments = CURVE_SEGMENTS[quality];
    const cutters: Manifold[] = [];

    try {
        for (const y of evenlySpacedCenterlines(parameters.depthMm, ribs.xCount)) {
            const alongY = grooveAlongY(
                module,
                ribs.widthMm,
                ribs.depthMm,
                parameters.widthMm,
                0,
                curveSegments,
            );
            cutters.push(translateAndDelete(rotateAndDelete(alongY, 0, 0, 90), 0, y, 0));
        }
        for (const x of evenlySpacedCenterlines(parameters.widthMm, ribs.yCount)) {
            cutters.push(
                grooveAlongY(
                    module,
                    ribs.widthMm,
                    ribs.depthMm,
                    parameters.depthMm,
                    x,
                    curveSegments,
                ),
            );
        }
        return cutters;
    } catch (error) {
        for (const cutter of cutters) cutter.delete();
        throw error;
    }
}

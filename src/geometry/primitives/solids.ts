import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { revolvedProfile } from './revolve';

export function annularPrism(
    module: ManifoldToplevel,
    innerRadiusMm: number,
    outerRadiusMm: number,
    bottomZMm: number,
    topZMm: number,
    segments: number,
): Manifold {
    return revolvedProfile(
        module,
        [
            [innerRadiusMm, bottomZMm],
            [outerRadiusMm, bottomZMm],
            [outerRadiusMm, topZMm],
            [innerRadiusMm, topZMm],
        ],
        segments,
    );
}

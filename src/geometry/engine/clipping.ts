import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { discardNumericalShells, evaluateAndDisposeInputs } from './operations';
import { translateAndDeleteSource } from './transforms';

export function clipByZ(
    module: ManifoldToplevel,
    source: Manifold,
    bottomZMm: number,
    heightMm: number,
): Manifold {
    const bounds = source.boundingBox();
    const span =
        Math.max(
            Math.abs(bounds.min[0]),
            Math.abs(bounds.max[0]),
            Math.abs(bounds.min[1]),
            Math.abs(bounds.max[1]),
        ) *
            2 +
        4;
    const clip = translateAndDeleteSource(
        module.Manifold.cube([span, span, heightMm], true),
        0,
        0,
        bottomZMm + heightMm / 2,
    );
    return discardNumericalShells(evaluateAndDisposeInputs(source.intersect(clip), [clip]));
}

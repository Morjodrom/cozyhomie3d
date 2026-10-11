import { revolvedProfile as revolveProfile } from '../../../geometry/primitives/revolve';
import type { PotParameters } from '../domain/design';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    RIB_ROOT_EMBED_MM,
    roundedRibProfile,
    topAnchoredEvenlySpacedHoopElevations,
} from '../../../geometry/features/rigidity-ribs';

/** Annular hoop ribs and a continuous annular wall-to-floor gusset for tapered pots. */
export function buildPotRigidityRibs(
    module: ManifoldToplevel,
    parameters: PotParameters,
    circularSegments: number,
    curveSegments: number,
): Manifold[] {
    const ribs = parameters.rigidityRibs;
    if (!ribs.enabled) return [];
    const slope =
        (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm;
    const wallAt = (z: number) =>
        parameters.bottomDiameterMm / 2 +
        slope * z +
        (ribs.placement === 'inside' ? -parameters.wallThicknessMm : 0);
    const direction = ribs.placement === 'inside' ? -1 : 1;
    const result: Manifold[] = [];
    const rootAt = (z: number) => wallAt(z) - direction * RIB_ROOT_EMBED_MM;
    const floorMm = ribs.placement === 'inside' ? parameters.bottomThicknessMm : 0;
    for (const z of topAnchoredEvenlySpacedHoopElevations(
        parameters.heightMm,
        ribs.wallBottomGussetMm,
        ribs.baseWidthMm,
        ribs.count,
        floorMm,
    )) {
        const profile = roundedRibProfile(
            ribs.baseWidthMm,
            ribs.projectionMm + RIB_ROOT_EMBED_MM,
            curveSegments,
        ).map(([offset, displacement]): [number, number] => [
            rootAt(z + offset) + direction * displacement,
            z + offset,
        ]);
        result.push(
            revolveProfile(module, direction < 0 ? profile.reverse() : profile, circularSegments),
        );
    }
    const rootBottom = rootAt(floorMm);
    const rootTop = rootAt(floorMm + ribs.wallBottomGussetMm);
    const floorApex = wallAt(floorMm) + direction * ribs.wallBottomGussetMm;
    result.push(
        revolveProfile(
            module,
            direction < 0
                ? [
                      [rootBottom, floorMm],
                      [rootTop, floorMm + ribs.wallBottomGussetMm],
                      [floorApex, floorMm],
                  ]
                : [
                      [rootBottom, floorMm],
                      [floorApex, floorMm],
                      [rootTop, floorMm + ribs.wallBottomGussetMm],
                  ],
            circularSegments,
        ),
    );
    return result;
}

import type { BuildQuality } from '../../../domain/worker';
import type { PotParameters } from '../domain/design';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import {
    CURVE_SEGMENTS,
    concentricRibRadii,
    roundedVProfile,
} from '../../../geometry/features/bottom-ribs';

export function buildPotBottomRibCutters(
    module: ManifoldToplevel,
    parameters: PotParameters,
    quality: BuildQuality,
    circularSegments: number,
    availableRadiusMm = parameters.bottomDiameterMm / 2,
): Manifold[] {
    const ribs = parameters.bottomRibs;
    if (!ribs.enabled) return [];
    const curveSegments = CURVE_SEGMENTS[quality];
    const cutters: Manifold[] = [];

    try {
        for (const radius of concentricRibRadii(availableRadiusMm, ribs.count)) {
            const localProfile = roundedVProfile(ribs.widthMm, ribs.depthMm, curveSegments);
            const ringProfile = localProfile.map(([offset, z]): [number, number] => [
                radius + offset,
                z,
            ]);
            const profile = new module.CrossSection([ringProfile]);
            try {
                cutters.push(module.Manifold.revolve(profile, circularSegments));
            } finally {
                profile.delete();
            }
        }
        return cutters;
    } catch (error) {
        for (const cutter of cutters) cutter.delete();
        throw error;
    }
}

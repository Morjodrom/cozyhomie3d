import type { BedAdhesionBeams } from '../../domain/shared/features';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { evaluateAndDisposeInputs } from '../engine/operations';
import { orientExtrusionAlongY } from '../primitives/rounded-rectangle';

export function addBedAdhesionBeams(
    module: ManifoldToplevel,
    source: Manifold,
    bedContactRadiusMm: number,
    beams: BedAdhesionBeams,
): Manifold {
    if (beams.count === 0) return source;

    const sideDivisions =
        beams.modelSideHeightMm > 0 ? Math.max(1, Math.ceil(beams.modelSideHeightMm / 0.5)) : 0;
    const sideSlices = Array.from({ length: sideDivisions + 1 }, (_, index) => {
        const zMm = sideDivisions === 0 ? 0 : (beams.modelSideHeightMm * index) / sideDivisions;
        const section = source.slice(zMm);
        try {
            return { zMm, polygons: section.toPolygons() };
        } finally {
            section.delete();
        }
    });
    const measuredContactRadius = (
        angleRad: number,
        polygons: Array<Array<readonly [number, number]>>,
    ): number => {
        const radialX = Math.cos(angleRad);
        const radialY = Math.sin(angleRad);
        const tangentX = -radialY;
        const tangentY = radialX;
        let radiusMm = bedContactRadiusMm;
        for (const polygon of polygons) {
            for (const [x, y] of polygon) {
                if (Math.abs(x * tangentX + y * tangentY) > beams.widthMm / 2 + 0.5) continue;
                radiusMm = Math.max(radiusMm, x * radialX + y * radialY);
            }
        }
        return radiusMm;
    };
    const inputs: Manifold[] = [source];
    try {
        for (let index = 0; index < beams.count; index += 1) {
            const angleDeg = (index * 360) / beams.count;
            const angleRad = (angleDeg * Math.PI) / 180;
            // Measure the finished model at the bed so the 0.05 mm separation is
            // from its real textured edge, not from a conservative radius above it.
            // Manifold booleans need a small volumetric intersection; a nearly zero
            // negative value would otherwise remain only tangent after tessellation.
            const booleanOverlapMm = beams.breakawayDistanceMm < 0 ? 0.25 : 0;
            const sideProfile = sideSlices.map(
                ({ zMm, polygons }) =>
                    [
                        measuredContactRadius(angleRad, polygons) +
                            beams.breakawayDistanceMm -
                            booleanOverlapMm,
                        zMm,
                    ] as [number, number],
            );
            const innerBottomRadiusMm = sideProfile[0][0];
            const outerRadiusMm = innerBottomRadiusMm + beams.lengthMm;
            const contour: Array<[number, number]> = [
                [innerBottomRadiusMm, 0],
                [outerRadiusMm, 0],
            ];
            if (beams.outerSideHeightMm > 0) contour.push([outerRadiusMm, beams.outerSideHeightMm]);
            if (beams.modelSideHeightMm > 0) {
                for (const point of sideProfile.slice(1).reverse()) contour.push(point);
            }
            const profile = new module.CrossSection([contour]);
            let beam: Manifold;
            try {
                beam = orientExtrusionAlongY(profile.extrude(beams.widthMm), beams.widthMm / 2, 0);
            } finally {
                profile.delete();
            }
            if (angleDeg !== 0) {
                let rotated: Manifold;
                try {
                    rotated = beam.rotate(0, 0, angleDeg);
                } finally {
                    beam.delete();
                }
                beam = rotated;
            }
            inputs.push(beam);
        }
        const result =
            beams.breakawayDistanceMm < 0
                ? module.Manifold.union(inputs)
                : module.Manifold.compose(inputs);
        return evaluateAndDisposeInputs(result, inputs.splice(0));
    } catch (error) {
        for (const input of inputs) input.delete();
        throw error;
    }
}

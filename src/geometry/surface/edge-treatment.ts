import type { DrawerParameters } from '../../shapes/drawer/domain/design';
import type { EdgeTreatment } from '../../domain/shared/features';
import type { PotParameters } from '../../shapes/pot/domain/design';

export type AxialEdgeTreatment = {
    bottomSizeMm: number;
    topSizeMm: number;
};

export function resolveEdgeTreatmentSize(treatment: EdgeTreatment, ...limitsMm: number[]): number {
    if (treatment.style === 'none') return 0;
    return Math.min(treatment.sizeMm, ...limitsMm);
}

export function resolveAxialEdgeTreatment(
    treatment: EdgeTreatment,
    dimensions: { bottomWallMm: number; bottomThicknessMm: number; topWallMm: number },
): AxialEdgeTreatment {
    return {
        bottomSizeMm: resolveEdgeTreatmentSize(
            treatment,
            dimensions.bottomWallMm / 2,
            dimensions.bottomThicknessMm / 2,
        ),
        topSizeMm: resolveEdgeTreatmentSize(treatment, dimensions.topWallMm / 2),
    };
}

export function defaultAxialEdgeTreatment(
    parameters: Pick<
        PotParameters | DrawerParameters,
        'edgeTreatment' | 'wallThicknessMm' | 'bottomThicknessMm'
    >,
): AxialEdgeTreatment {
    return resolveAxialEdgeTreatment(parameters.edgeTreatment, {
        bottomWallMm: parameters.wallThicknessMm,
        bottomThicknessMm: parameters.bottomThicknessMm,
        topWallMm: parameters.wallThicknessMm,
    });
}

export function edgeInsetForDistance(
    distanceMm: number,
    sizeMm: number,
    treatment: EdgeTreatment,
): number {
    if (treatment.style === 'none' || distanceMm >= sizeMm) return 0;
    if (treatment.style === 'chamfered') return sizeMm - distanceMm;
    return sizeMm - Math.sqrt(Math.max(0, sizeMm ** 2 - (distanceMm - sizeMm) ** 2));
}

export function edgeInsetAtZ(
    zMm: number,
    heightMm: number,
    treatment: EdgeTreatment,
    axialTreatment: AxialEdgeTreatment,
): number {
    const bottomInset = edgeInsetForDistance(zMm, axialTreatment.bottomSizeMm, treatment);
    const topInset = edgeInsetForDistance(heightMm - zMm, axialTreatment.topSizeMm, treatment);
    return Math.max(bottomInset, topInset);
}

export function verticalLevels(
    heightMm: number,
    divisions: number,
    treatment: EdgeTreatment,
    axialTreatment: AxialEdgeTreatment,
    edgeSegments: number,
): number[] {
    const levels = new Set<number>();
    for (let index = 0; index <= divisions; index += 1) levels.add((heightMm * index) / divisions);
    if (treatment.style !== 'none') {
        const steps = treatment.style === 'rounded' ? edgeSegments : 1;
        for (let index = 0; index <= steps; index += 1) {
            levels.add((axialTreatment.bottomSizeMm * index) / steps);
            levels.add(heightMm - (axialTreatment.topSizeMm * index) / steps);
        }
    }
    return [...levels].sort((a, b) => a - b);
}

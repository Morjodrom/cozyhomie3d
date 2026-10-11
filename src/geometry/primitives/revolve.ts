import type { Manifold, ManifoldToplevel } from 'manifold-3d';

export function revolvedProfile(
    module: ManifoldToplevel,
    points: Array<[number, number]>,
    segments: number,
): Manifold {
    const profile = new module.CrossSection([points]);
    try {
        return profile.revolve(segments);
    } finally {
        profile.delete();
    }
}

export function roundedRadialTransition(
    radiusMm: number,
    zMm: number,
    sizeMm: number,
    outward: boolean,
    segments: number,
    rising: boolean,
): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    for (let index = 0; index <= segments; index += 1) {
        const t = index / segments;
        const angle = (t * Math.PI) / 2;
        const dz = sizeMm * (1 - Math.cos(angle));
        const dr = sizeMm * (1 - Math.sin(angle));
        points.push([radiusMm + (outward ? dr : -dr), zMm + (rising ? dz : -dz)]);
    }
    return points;
}

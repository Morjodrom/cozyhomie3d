import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { translateAndDeleteSource } from '../engine/transforms';

/** Counter-clockwise rounded rectangle in the XY plane, centered at the origin. */
export function roundedRectangleContour(
    widthMm: number,
    heightMm: number,
    radiusMm: number,
    segmentsPerCorner: number,
): Array<[number, number]> {
    const halfWidth = widthMm / 2;
    const halfHeight = heightMm / 2;
    if (radiusMm <= 0) {
        return [
            [-halfWidth, -halfHeight],
            [halfWidth, -halfHeight],
            [halfWidth, halfHeight],
            [-halfWidth, halfHeight],
        ];
    }

    const radius = Math.min(radiusMm, halfWidth, halfHeight);
    const segments = Math.max(1, Math.floor(segmentsPerCorner));
    const corners = [
        { x: halfWidth - radius, y: halfHeight - radius, start: 0 },
        { x: -halfWidth + radius, y: halfHeight - radius, start: Math.PI / 2 },
        { x: -halfWidth + radius, y: -halfHeight + radius, start: Math.PI },
        { x: halfWidth - radius, y: -halfHeight + radius, start: Math.PI * 1.5 },
    ];
    const points: Array<[number, number]> = [];
    for (const corner of corners) {
        for (let step = 0; step < segments; step += 1) {
            const angle = corner.start + ((step / segments) * Math.PI) / 2;
            points.push([corner.x + radius * Math.cos(angle), corner.y + radius * Math.sin(angle)]);
        }
    }
    return points;
}

export function orientExtrusionAlongY(source: Manifold, endY: number, centerZ: number): Manifold {
    let rotated: Manifold;
    try {
        rotated = source.rotate(90, 0, 0);
    } finally {
        source.delete();
    }
    return translateAndDeleteSource(rotated, 0, endY, centerZ);
}

export function roundedRectanglePrismAlongY(
    module: ManifoldToplevel,
    widthMm: number,
    heightMm: number,
    radiusMm: number,
    startY: number,
    endY: number,
    centerZ: number,
    segmentsPerCorner: number,
): Manifold {
    const profile = new module.CrossSection([
        roundedRectangleContour(widthMm, heightMm, radiusMm, segmentsPerCorner),
    ]);
    try {
        return orientExtrusionAlongY(profile.extrude(endY - startY), endY, centerZ);
    } finally {
        profile.delete();
    }
}

export function roundedRectangleFrameAlongY(
    module: ManifoldToplevel,
    openingWidthMm: number,
    openingHeightMm: number,
    openingRadiusMm: number,
    frameWidthMm: number,
    startY: number,
    endY: number,
    centerZ: number,
    segmentsPerCorner: number,
): Manifold {
    const inner = new module.CrossSection([
        roundedRectangleContour(
            openingWidthMm,
            openingHeightMm,
            openingRadiusMm,
            segmentsPerCorner,
        ),
    ]);
    const outer = new module.CrossSection([
        roundedRectangleContour(
            openingWidthMm + 2 * frameWidthMm,
            openingHeightMm + 2 * frameWidthMm,
            openingRadiusMm + frameWidthMm,
            segmentsPerCorner,
        ),
    ]);
    let frame;
    try {
        frame = outer.subtract(inner);
    } finally {
        outer.delete();
        inner.delete();
    }
    try {
        return orientExtrusionAlongY(frame.extrude(endY - startY), endY, centerZ);
    } finally {
        frame.delete();
    }
}

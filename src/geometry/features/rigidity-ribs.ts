export const RIB_ROOT_EMBED_MM = 0.25;

export function topAnchoredEvenlySpacedHoopElevations(
    heightMm: number,
    gussetMm: number,
    baseWidthMm: number,
    count: number,
    floorMm = 0,
): number[] {
    if (count <= 0) return [];
    const low = floorMm + gussetMm + baseWidthMm + 0.6;
    const high = heightMm - baseWidthMm / 2;
    const pitch = (high - low) / count;
    return Array.from({ length: count }, (_, index) => high - pitch * index);
}

export function rigidityRibCenterlines(sizeMm: number, count: number): number[] {
    if (count <= 0) return [];
    const spacing = sizeMm / (count + 1);
    return Array.from({ length: count }, (_, index) => -sizeMm / 2 + spacing * (index + 1));
}

export function roundedRibProfile(
    widthMm: number,
    projectionMm: number,
    curveSegments: number,
): Array<[number, number]> {
    const segments = Math.max(2, Math.floor(curveSegments));
    const sampleCount = segments * 2;
    return Array.from({ length: sampleCount + 1 }, (_, index) => {
        const t = index / sampleCount;
        return [widthMm * (t - 0.5), (projectionMm * (1 - Math.cos(2 * Math.PI * t))) / 2];
    });
}

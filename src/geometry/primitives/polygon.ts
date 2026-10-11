import type { Point } from '../mesh/types';

export function insetConvexPolygon(polygon: Point[], requestedInsetMm: number): Point[] {
    const centroid = polygon.reduce<Point>(
        (sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length],
        [0, 0],
    );
    const edgeDistance = (a: Point, b: Point) => {
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return (
            ((b[0] - a[0]) * (centroid[1] - a[1]) - (b[1] - a[1]) * (centroid[0] - a[0])) / length
        );
    };
    const minimumEdgeDistance = Math.min(
        ...polygon.map((point, index) =>
            edgeDistance(point, polygon[(index + 1) % polygon.length]),
        ),
    );
    const insetMm = Math.max(0, Math.min(requestedInsetMm, minimumEdgeDistance * 0.45));
    return polygon.map((point, index) => {
        const previous = polygon[(index + polygon.length - 1) % polygon.length];
        const next = polygon[(index + 1) % polygon.length];
        const previousLength = Math.hypot(point[0] - previous[0], point[1] - previous[1]) || 1;
        const nextLength = Math.hypot(next[0] - point[0], next[1] - point[1]) || 1;
        const previousNormal: Point = [
            -(point[1] - previous[1]) / previousLength,
            (point[0] - previous[0]) / previousLength,
        ];
        const nextNormal: Point = [
            -(next[1] - point[1]) / nextLength,
            (next[0] - point[0]) / nextLength,
        ];
        const denominator =
            1 + previousNormal[0] * nextNormal[0] + previousNormal[1] * nextNormal[1];
        if (denominator < 1e-8)
            return [point[0] + previousNormal[0] * insetMm, point[1] + previousNormal[1] * insetMm];
        return [
            point[0] + ((previousNormal[0] + nextNormal[0]) * insetMm) / denominator,
            point[1] + ((previousNormal[1] + nextNormal[1]) * insetMm) / denominator,
        ];
    });
}

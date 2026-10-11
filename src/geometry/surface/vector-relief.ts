import type { TextureConfig } from '../../domain/shared/textures';
import type { Point, RawMesh, VectorReliefOptions } from '../mesh/types';
import { textureBand } from './textures';

function coverageDepth(
    texture: Exclude<TextureConfig, { kind: 'smooth' }>,
    zMm: number,
    heightMm: number,
): number {
    const [start, end] = textureBand(texture, heightMm);
    if (zMm < start || zMm > end) return 0;
    if (texture.kind === 'ribs')
        return (texture.reliefMode === 'emboss' ? 1 : -1) * texture.depthMm;
    const smooth = (v: number) => {
        const t = Math.max(0, Math.min(1, v));
        return t * t * (3 - 2 * t);
    };
    const fade = Math.min(
        texture.bottomFadeMm ? smooth((zMm - start) / texture.bottomFadeMm) : 1,
        texture.topFadeMm ? smooth((end - zMm) / texture.topFadeMm) : 1,
    );
    return (texture.reliefMode === 'emboss' ? 1 : -1) * texture.depthMm * fade;
}

export type SurfaceMapper = (
    uMm: number,
    zMm: number,
    displacementMm: number,
) => readonly [number, number, number];
type RoundedPathTexture = Extract<
    TextureConfig,
    { kind: 'ribs' | 'honeycomb' | 'voronoi' | 'fractal' }
>;

export function clipSegmentToRect(
    a: Point,
    b: Point,
    minU: number,
    maxU: number,
    minZ: number,
    maxZ: number,
): readonly [Point, Point] | undefined {
    const delta: Point = [b[0] - a[0], b[1] - a[1]];
    let low = 0;
    let high = 1;
    const clip = (p: number, q: number): boolean => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const ratio = q / p;
        if (p < 0) low = Math.max(low, ratio);
        else high = Math.min(high, ratio);
        return low <= high;
    };
    if (
        !clip(-delta[0], a[0] - minU) ||
        !clip(delta[0], maxU - a[0]) ||
        !clip(-delta[1], a[1] - minZ) ||
        !clip(delta[1], maxZ - a[1])
    )
        return undefined;
    return [
        [a[0] + delta[0] * low, a[1] + delta[1] * low],
        [a[0] + delta[0] * high, a[1] + delta[1] * high],
    ];
}

function adaptiveAxisParameters(a: Point, b: Point, map: SurfaceMapper, errorMm: number): number[] {
    const values = [0];
    const walk = (from: number, to: number, depth: number): void => {
        const midpoint = (from + to) / 2;
        const uv = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const p0 = map(...uv(from), 0);
        const p1 = map(...uv(to), 0);
        const pm = map(...uv(midpoint), 0);
        const error = Math.hypot(
            pm[0] - (p0[0] + p1[0]) / 2,
            pm[1] - (p0[1] + p1[1]) / 2,
            pm[2] - (p0[2] + p1[2]) / 2,
        );
        if (depth < 12 && error > errorMm) {
            walk(from, midpoint, depth + 1);
            walk(midpoint, to, depth + 1);
            return;
        }
        values.push(to);
    };
    walk(0, 1, 0);
    return values;
}

function arcSegments(radiusMm: number, angleRad: number, chordErrorMm: number): number {
    const cosine = Math.max(-1, Math.min(1, 1 - Math.max(1e-6, chordErrorMm) / radiusMm));
    const maxAngle = 2 * Math.acos(cosine);
    return Math.max(2, Math.ceil(angleRad / Math.max(1e-3, maxAngle)));
}

/** A round-capped half-cylinder projected along one path on the carrier surface. */
export function roundedPathMesh(
    segment: { a: Point; b: Point; widthMm: number },
    texture: RoundedPathTexture,
    heightMm: number,
    map: SurfaceMapper,
    options: VectorReliefOptions,
): RawMesh | undefined {
    const dx = segment.b[0] - segment.a[0];
    const dz = segment.b[1] - segment.a[1];
    const length = Math.hypot(dx, dz);
    const radius = segment.widthMm / 2;
    if (length < 1e-7 || radius <= 0 || texture.depthMm <= 0) return undefined;
    const along: Point = [dx / length, dz / length];
    const across: Point = [-along[1], along[0]];
    const profileRadius = Math.max(radius, texture.depthMm);
    const radialSegments = Math.max(4, arcSegments(profileRadius, Math.PI, options.chordErrorMm));
    const capSegments = arcSegments(profileRadius, Math.PI / 2, options.chordErrorMm);
    const axisParameters = adaptiveAxisParameters(segment.a, segment.b, map, options.chordErrorMm);
    const rings: Array<{ distance: number; crossRadius: number }> = [];
    for (let i = 1; i <= capSegments; i += 1) {
        const angle = (((capSegments - i) / capSegments) * Math.PI) / 2;
        rings.push({ distance: -radius * Math.sin(angle), crossRadius: radius * Math.cos(angle) });
    }
    for (const t of axisParameters.slice(1, -1))
        rings.push({ distance: length * t, crossRadius: radius });
    for (let i = 0; i < capSegments; i += 1) {
        const angle = ((i / capSegments) * Math.PI) / 2;
        rings.push({
            distance: length + radius * Math.sin(angle),
            crossRadius: radius * Math.cos(angle),
        });
    }

    const positions: number[] = [];
    const indices: number[] = [];
    const sign = texture.reliefMode === 'emboss' ? 1 : -1;
    const overlap = options.carrierSagittaMm + options.chordErrorMm + 0.01;
    const mapped = (distance: number, transverse: number, profile: number) => {
        const u = segment.a[0] + along[0] * distance + across[0] * transverse;
        const z = segment.a[1] + along[1] * distance + across[1] * transverse;
        return map(u, z, profile * Math.abs(coverageDepth(texture, z, heightMm)));
    };
    const aTip = positions.length / 3;
    positions.push(...mapped(-radius, 0, 0));
    const ringStarts: number[] = [];
    for (const ring of rings) {
        ringStarts.push(positions.length / 3);
        for (let side = 0; side <= radialSegments; side += 1) {
            const angle = (side / radialSegments) * Math.PI;
            positions.push(
                ...mapped(
                    ring.distance,
                    ring.crossRadius * Math.cos(angle),
                    ((sign * ring.crossRadius) / radius) * Math.sin(angle),
                ),
            );
        }
    }
    const bTip = positions.length / 3;
    positions.push(...mapped(length + radius, 0, 0));
    for (let side = 0; side < radialSegments; side += 1)
        indices.push(aTip, ringStarts[0] + side, ringStarts[0] + side + 1);
    for (let ring = 0; ring < ringStarts.length - 1; ring += 1) {
        for (let side = 0; side < radialSegments; side += 1) {
            const a = ringStarts[ring] + side;
            const b = ringStarts[ring + 1] + side;
            indices.push(a, b, b + 1, a, b + 1, a + 1);
        }
    }
    const lastRing = ringStarts[ringStarts.length - 1];
    for (let side = 0; side < radialSegments; side += 1)
        indices.push(lastRing + side, bTip, lastRing + side + 1);

    const boundary = [
        aTip,
        ...ringStarts,
        bTip,
        ...[...ringStarts].reverse().map((start) => start + radialSegments),
    ];
    const embedded: number[] = [];
    for (const outerIndex of boundary) {
        // Re-map the boundary point rather than offsetting in world space so tapered
        // pots and drawer faces use the same carrier-normal convention.
        const source =
            outerIndex === aTip
                ? { distance: -radius, transverse: 0 }
                : outerIndex === bTip
                  ? { distance: length + radius, transverse: 0 }
                  : (() => {
                        const ringIndex = ringStarts.findIndex(
                            (start) =>
                                outerIndex === start || outerIndex === start + radialSegments,
                        );
                        return {
                            distance: rings[ringIndex].distance,
                            transverse:
                                outerIndex === ringStarts[ringIndex]
                                    ? rings[ringIndex].crossRadius
                                    : -rings[ringIndex].crossRadius,
                        };
                    })();
        embedded.push(positions.length / 3);
        const u = segment.a[0] + along[0] * source.distance + across[0] * source.transverse;
        const z = segment.a[1] + along[1] * source.distance + across[1] * source.transverse;
        positions.push(...map(u, z, -sign * overlap));
    }
    for (let i = 0; i < boundary.length; i += 1) {
        const next = (i + 1) % boundary.length;
        indices.push(
            boundary[i],
            embedded[i],
            embedded[next],
            boundary[i],
            embedded[next],
            boundary[next],
        );
    }
    const baseCenter = positions.length / 3;
    {
        const u = segment.a[0] + (along[0] * length) / 2;
        const z = segment.a[1] + (along[1] * length) / 2;
        positions.push(...map(u, z, -sign * overlap));
    }
    for (let i = 0; i < embedded.length; i += 1)
        indices.push(baseCenter, embedded[(i + 1) % embedded.length], embedded[i]);
    if (texture.reliefMode === 'emboss')
        for (let i = 0; i < indices.length; i += 3)
            [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

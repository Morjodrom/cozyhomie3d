import {
    createTextureDefault,
    type TextureConfig,
    type TextureKind,
} from '../../domain/shared/textures';
import { type BuildQuality, type MeshData } from '../../domain/worker';
import { expect } from 'vitest';
import { type buildGeometry } from '../build';
import { type SurfaceSample } from '../surface/textures';

export const potSample: SurfaceSample = {
    uMm: 0,
    perimeterMm: 320,
    zMm: 50,
    heightMm: 100,
    xMm: 50,
    yMm: 0,
};
export const CELL_TEXTURE_QUALITY_CASES = (['honeycomb', 'voronoi'] as const).flatMap((kind) =>
    (['draft', 'preview', 'export'] satisfies BuildQuality[]).flatMap((quality) =>
        (['emboss', 'recess'] as const).map((reliefMode) => ({ kind, quality, reliefMode })),
    ),
);

export function createSparseTexture(kind: TextureKind): TextureConfig {
    const texture = createTextureDefault(kind);
    if (texture.kind === 'smooth' || texture.kind === 'noise') return texture;
    if (texture.kind === 'ribs') {
        return {
            ...texture,
            scaleMm: 30,
            depthMm: 0.5,
            bottomOffsetPercent: 20,
            topOffsetPercent: 20,
        };
    }
    return {
        ...texture,
        scaleMm: 30,
        depthMm: 0.5,
        bottomOffsetPercent: 20,
        topOffsetPercent: 20,
        bottomFadeMm: 0,
        topFadeMm: 0,
    };
}

export function intersectionsAlongY(
    positions: Float32Array,
    indices: Uint32Array,
    x: number,
    z: number,
): number[] {
    const intersections: number[] = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
        const vertex = (corner: number) => {
            const index = indices[offset + corner] * 3;
            return { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
        };
        const a = vertex(0);
        const b = vertex(1);
        const c = vertex(2);
        const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(denominator) < 1e-8) continue;
        const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
        const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
        const wc = 1 - wa - wb;
        if (wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7)
            intersections.push(wa * a.y + wb * b.y + wc * c.y);
    }
    return intersections;
}

export function intersectionsAlongX(
    positions: Float32Array,
    indices: Uint32Array,
    y: number,
    z: number,
): number[] {
    const intersections: number[] = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
        const vertex = (corner: number) => {
            const index = indices[offset + corner] * 3;
            return { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
        };
        const a = vertex(0);
        const b = vertex(1);
        const c = vertex(2);
        const denominator = (b.z - c.z) * (a.y - c.y) + (c.y - b.y) * (a.z - c.z);
        if (Math.abs(denominator) < 1e-8) continue;
        const wa = ((b.z - c.z) * (y - c.y) + (c.y - b.y) * (z - c.z)) / denominator;
        const wb = ((c.z - a.z) * (y - c.y) + (a.y - c.y) * (z - c.z)) / denominator;
        const wc = 1 - wa - wb;
        if (wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7)
            intersections.push(wa * a.x + wb * b.x + wc * c.x);
    }
    return intersections;
}

/** Test-only mesh surface area; production stats intentionally do not expose it. */
export function triangleArea(positions: Float32Array, indices: Uint32Array): number {
    let area = 0;
    for (let offset = 0; offset < indices.length; offset += 3) {
        const a = indices[offset] * 3;
        const b = indices[offset + 1] * 3;
        const c = indices[offset + 2] * 3;
        const ab: [number, number, number] = [
            positions[b] - positions[a],
            positions[b + 1] - positions[a + 1],
            positions[b + 2] - positions[a + 2],
        ];
        const ac: [number, number, number] = [
            positions[c] - positions[a],
            positions[c + 1] - positions[a + 1],
            positions[c + 2] - positions[a + 2],
        ];
        area +=
            Math.hypot(
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            ) / 2;
    }
    return area;
}

export function coplanarBottomArea(mesh: MeshData): number {
    let area = 0;
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
        const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
        if (!indices.every((index) => Math.abs(mesh.positions[index * 3 + 2]) < 1e-4)) continue;
        const [a, b, c] = indices.map((index) => [
            mesh.positions[index * 3],
            mesh.positions[index * 3 + 1],
        ]);
        area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
    return area;
}

export function connectedComponentCount(mesh: MeshData): number {
    const parent = Array.from({ length: mesh.positions.length / 3 }, (_, index) => index);
    const root = (index: number): number => {
        while (parent[index] !== index) {
            parent[index] = parent[parent[index]];
            index = parent[index];
        }
        return index;
    };
    const join = (a: number, b: number) => {
        const aRoot = root(a);
        const bRoot = root(b);
        if (aRoot !== bRoot) parent[bRoot] = aRoot;
    };
    const used = new Set<number>();
    for (let offset = 0; offset < mesh.indices.length; offset += 3) {
        const [a, b, c] = [
            mesh.indices[offset],
            mesh.indices[offset + 1],
            mesh.indices[offset + 2],
        ];
        used.add(a);
        used.add(b);
        used.add(c);
        join(a, b);
        join(a, c);
    }
    return new Set([...used].map(root)).size;
}

export function hasVertexAtRadiusAndZ(
    mesh: MeshData,
    radiusMm: number,
    zMm: number,
    toleranceMm = 0.05,
): boolean {
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
        const radius = Math.hypot(mesh.positions[offset], mesh.positions[offset + 1]);
        if (
            Math.abs(radius - radiusMm) < toleranceMm &&
            Math.abs(mesh.positions[offset + 2] - zMm) < toleranceMm
        )
            return true;
    }
    return false;
}

export function singleMesh(result: Awaited<ReturnType<typeof buildGeometry>>): MeshData {
    expect(result.parts).toHaveLength(1);
    return result.parts[0].mesh;
}

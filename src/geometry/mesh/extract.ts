import type { ModelPartData, ModelPartKind, ModelStats } from '../../domain/worker';
import type { Manifold } from 'manifold-3d';

import { MAX_TRIANGLES } from './limits';

export type GeometryResult = {
    parts: ModelPartData[];
    stats: ModelStats;
    warnings: string[];
};

function calculateVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
    const normals = new Float32Array(positions.length);
    for (let offset = 0; offset < indices.length; offset += 3) {
        const ia = indices[offset] * 3;
        const ib = indices[offset + 1] * 3;
        const ic = indices[offset + 2] * 3;
        const abx = positions[ib] - positions[ia];
        const aby = positions[ib + 1] - positions[ia + 1];
        const abz = positions[ib + 2] - positions[ia + 2];
        const acx = positions[ic] - positions[ia];
        const acy = positions[ic + 1] - positions[ia + 1];
        const acz = positions[ic + 2] - positions[ia + 2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        for (const index of [ia, ib, ic]) {
            normals[index] += nx;
            normals[index + 1] += ny;
            normals[index + 2] += nz;
        }
    }

    for (let offset = 0; offset < normals.length; offset += 3) {
        const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
        normals[offset] /= length;
        normals[offset + 1] /= length;
        normals[offset + 2] /= length;
    }
    return normals;
}

export function extractGeometry(
    manifold: Manifold,
    kind: ModelPartKind,
    initialWarnings: string[] = [],
): GeometryResult {
    const triangleCount = manifold.numTri();
    if (triangleCount > MAX_TRIANGLES) {
        throw new Error(
            `Model has ${triangleCount.toLocaleString()} triangles; the export limit is ${MAX_TRIANGLES.toLocaleString()}.`,
        );
    }

    const source = manifold.getMesh();
    const positions = new Float32Array(source.numVert * 3);
    for (let vertex = 0; vertex < source.numVert; vertex += 1) {
        const sourceOffset = vertex * source.numProp;
        const destinationOffset = vertex * 3;
        positions[destinationOffset] = source.vertProperties[sourceOffset];
        positions[destinationOffset + 1] = source.vertProperties[sourceOffset + 1];
        positions[destinationOffset + 2] = source.vertProperties[sourceOffset + 2];
    }
    const indices = new Uint32Array(source.triVerts);
    const bounds = manifold.boundingBox();
    const warnings = [
        ...initialWarnings,
        ...(triangleCount > 150_000
            ? ['This detailed model may take longer to preview and slice.']
            : []),
    ];

    const mesh = { positions, indices, normals: calculateVertexNormals(positions, indices) };
    return {
        parts: [{ kind, mesh, previewOffsetMm: [0, 0, 0] }],
        stats: {
            boundsMm: [
                bounds.max[0] - bounds.min[0],
                bounds.max[1] - bounds.min[1],
                bounds.max[2] - bounds.min[2],
            ],
            volumeMm3: manifold.volume(),
            triangleCount,
        },
        warnings,
    };
}

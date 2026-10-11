import type { PotParameters } from '../domain/design';
import type { TextureConfig } from '../../../domain/shared/textures';
import { capLoop, connectLoops } from '../../../geometry/mesh/loops';
import type { RawMesh, Tessellation, VectorReliefOptions } from '../../../geometry/mesh/types';
import {
    defaultAxialEdgeTreatment,
    edgeInsetAtZ,
    verticalLevels,
    type AxialEdgeTreatment,
} from '../../../geometry/surface/edge-treatment';
import {
    clipSegmentToRect,
    roundedPathMesh,
    type SurfaceMapper,
} from '../../../geometry/surface/vector-relief';
import { textureBand, textureDisplacement } from '../../../geometry/surface/textures';
import { vectorTextureSegments } from '../../../geometry/surface/vector-textures';

export function potTexturePerimeter(parameters: PotParameters): number {
    const midpointRadius = (parameters.bottomDiameterMm + parameters.topDiameterMm) / 4;
    return Math.PI * 2 * midpointRadius;
}

function treatedPotRadius(
    parameters: PotParameters,
    zMm: number,
    axialTreatment: AxialEdgeTreatment,
): number {
    const bottomRadius = parameters.bottomDiameterMm / 2;
    const topRadius = parameters.topDiameterMm / 2;
    if (parameters.edgeTreatment.style === 'none')
        return bottomRadius + ((topRadius - bottomRadius) * zMm) / parameters.heightMm;
    const usableHeight = Math.max(
        1e-6,
        parameters.heightMm - axialTreatment.bottomSizeMm - axialTreatment.topSizeMm,
    );
    const sideZ = Math.max(
        axialTreatment.bottomSizeMm,
        Math.min(parameters.heightMm - axialTreatment.topSizeMm, zMm),
    );
    return (
        bottomRadius +
        ((topRadius - bottomRadius) * (sideZ - axialTreatment.bottomSizeMm)) / usableHeight
    );
}

export function buildPotOuterMesh(
    parameters: PotParameters,
    texture: TextureConfig,
    tessellation: Tessellation,
    axialTreatment = defaultAxialEdgeTreatment(parameters),
): RawMesh {
    const segments = tessellation.circularSegments;
    const positions: number[] = [];
    const indices: number[] = [];
    // Use one cylindrical texture domain for every height ring. Recomputing the
    // wrapped width from each tapered ring makes periodic features split as z changes.
    const texturePerimeterMm = potTexturePerimeter(parameters);

    const zLevels = verticalLevels(
        parameters.heightMm,
        texture.kind === 'smooth' ? 1 : tessellation.verticalSegments,
        parameters.edgeTreatment,
        axialTreatment,
        tessellation.edgeSegments ?? 3,
    );

    for (const z of zLevels) {
        const radius = treatedPotRadius(parameters, z, axialTreatment);
        const edgeInset = edgeInsetAtZ(
            z,
            parameters.heightMm,
            parameters.edgeTreatment,
            axialTreatment,
        );

        for (let segment = 0; segment < segments; segment += 1) {
            const along = segment / segments;
            const angle = along * Math.PI * 2;
            const xMm = radius * Math.cos(angle);
            const yMm = radius * Math.sin(angle);
            const displacement = textureDisplacement(texture, {
                uMm: along * texturePerimeterMm,
                perimeterMm: texturePerimeterMm,
                zMm: z,
                heightMm: parameters.heightMm,
                xMm,
                yMm,
            });
            const texturedRadius = radius - edgeInset + (edgeInset < 1e-7 ? displacement : 0);
            positions.push(texturedRadius * Math.cos(angle), texturedRadius * Math.sin(angle), z);
        }
    }

    for (let ring = 0; ring < zLevels.length - 1; ring += 1) {
        connectLoops(indices, ring * segments, (ring + 1) * segments, segments);
    }

    const bottomCenter = positions.length / 3;
    positions.push(0, 0, 0);
    capLoop(indices, 0, segments, bottomCenter, false);

    const topCenter = positions.length / 3;
    positions.push(0, 0, parameters.heightMm);
    capLoop(indices, (zLevels.length - 1) * segments, segments, topCenter, true);

    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

function potMapper(
    parameters: PotParameters,
    perimeterMm: number,
    baseInsetMm: number,
    axialTreatment: AxialEdgeTreatment,
): SurfaceMapper {
    return (u, z, depth) => {
        const radius = treatedPotRadius(parameters, z, axialTreatment) + depth + baseInsetMm;
        const angle = (u / perimeterMm) * Math.PI * 2;
        return [radius * Math.cos(angle), radius * Math.sin(angle), z];
    };
}

/**
 * Builds relief as vector-defined solids on top of the smooth shell.  Each
 * path edge is a mesh edge; there is intentionally no UV sampling grid here.
 */
export function buildPotVectorTextureMeshes(
    parameters: PotParameters,
    texture: TextureConfig,
    options: VectorReliefOptions,
    axialTreatment = defaultAxialEdgeTreatment(parameters),
): RawMesh[] {
    if (texture.kind === 'smooth' || texture.kind === 'noise') return [];
    const perimeter = potTexturePerimeter(parameters);
    // The carrier shell is a chordal approximation of the analytic frustum.
    // Overlap it by more than the stated chord error so booleans weld, rather
    // than merely touching two independently tessellated surfaces.
    const mapper = potMapper(parameters, perimeter, 0, axialTreatment);
    const result: RawMesh[] = [];
    const [bandMinZ, bandMaxZ] = textureBand(texture, parameters.heightMm);
    const minZ = Math.max(bandMinZ, axialTreatment.bottomSizeMm);
    const maxZ = Math.min(bandMaxZ, parameters.heightMm - axialTreatment.topSizeMm);
    const segments = vectorTextureSegments(texture, perimeter, parameters.heightMm);
    if (!segments.length) return [];
    // Every vector texture is one projected capsule per clipped centreline.
    // Periodic cell textures keep exactly one representative of each wrapped edge.
    const paths =
        texture.kind === 'ribs'
            ? segments
            : segments.filter((segment) => {
                  const midpointU = (segment.a[0] + segment.b[0]) / 2;
                  return midpointU >= 0 && midpointU < perimeter;
              });
    for (const segment of paths) {
        const radius = segment.widthMm / 2;
        const clipped = clipSegmentToRect(
            segment.a,
            segment.b,
            -1e12,
            1e12,
            minZ + radius,
            maxZ - radius,
        );
        if (!clipped) continue;
        const mesh = roundedPathMesh(
            { a: clipped[0], b: clipped[1], widthMm: segment.widthMm },
            texture,
            parameters.heightMm,
            mapper,
            options,
        );
        if (mesh) result.push(mesh);
    }
    return result;
}

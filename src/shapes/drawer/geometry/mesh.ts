import type { DrawerParameters, DrawerTextureWalls } from '../domain/design';
import type { EdgeTreatment } from '../../../domain/shared/features';
import type { TextureConfig } from '../../../domain/shared/textures';
import { capLoop, connectLoops } from '../../../geometry/mesh/loops';
import type {
    Point,
    RawMesh,
    Tessellation,
    VectorReliefOptions,
} from '../../../geometry/mesh/types';
import { insetConvexPolygon } from '../../../geometry/primitives/polygon';
import {
    defaultAxialEdgeTreatment,
    edgeInsetAtZ,
    edgeInsetForDistance,
    resolveEdgeTreatmentSize,
    verticalLevels,
} from '../../../geometry/surface/edge-treatment';
import {
    clipSegmentToRect,
    roundedPathMesh,
    type SurfaceMapper,
} from '../../../geometry/surface/vector-relief';
import {
    textureBand,
    textureDisplacement,
    type SurfaceSample,
} from '../../../geometry/surface/textures';
import { vectorTextureSegments } from '../../../geometry/surface/vector-textures';

type RectanglePoint = {
    point: Point;
    outward: Point;
    alongSide: number;
    uMm: number;
    corner?: boolean;
};

function smoothstep01(value: number): number {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
}

export type DrawerHandleBounds = {
    envelopeWidthMm: number;
    envelopeHeightMm: number;
    bottomZMm: number;
    topZMm: number;
    openingBottomZMm: number;
    openingTopZMm: number;
};

/** Resolves normalized top-to-bottom placement for the complete handle assembly. */
export function drawerHandleBounds(parameters: DrawerParameters): DrawerHandleBounds {
    const shellMm = parameters.handleStyle === 'recessed' ? parameters.wallThicknessMm : 0;
    const envelopeWidthMm = parameters.handleWidthMm + 2 * shellMm;
    const envelopeHeightMm = parameters.handleHeightMm + 2 * shellMm;
    const travelMm = Math.max(0, parameters.heightMm - envelopeHeightMm);
    const bottomZMm = travelMm * (1 - parameters.handlePositionPercent / 100);
    return {
        envelopeWidthMm,
        envelopeHeightMm,
        bottomZMm,
        topZMm: bottomZMm + envelopeHeightMm,
        openingBottomZMm: bottomZMm + shellMm,
        openingTopZMm: bottomZMm + envelopeHeightMm - shellMm,
    };
}

/** Keeps the front-wall texture out of the handle assembly and its print clearance. */
function drawerHandleClearanceMask(
    parameters: DrawerParameters,
    item: RectanglePoint,
    zMm: number,
): number {
    if (item.outward[1] !== -1) return 1;
    const clearanceMm = Math.max(1, parameters.wallThicknessMm);
    const bounds = drawerHandleBounds(parameters);
    const horizontalOutside = smoothstep01(
        (Math.abs(item.point[0]) - bounds.envelopeWidthMm / 2) / clearanceMm,
    );
    const below = smoothstep01((bounds.bottomZMm - zMm) / clearanceMm);
    const above = smoothstep01((zMm - bounds.topZMm) / clearanceMm);
    const verticalOutside = Math.max(below, above);
    return 1 - (1 - horizontalOutside) * (1 - verticalOutside);
}

function drawerTextureWallMask(textureWalls: DrawerTextureWalls, item: RectanglePoint): number {
    if (item.corner) return 0;
    if (item.outward[1] === -1) return Number(textureWalls.front);
    if (item.outward[1] === 1) return Number(textureWalls.back);
    return Number(textureWalls.sides);
}

function treatedRectangleLoop(
    width: number,
    depth: number,
    sideSegments: number,
    treatment: EdgeTreatment,
    edgeSegments: number,
): RectanglePoint[] {
    if (treatment.style === 'none') return rectangleLoop(width, depth, sideSegments);
    const r = Math.min(treatment.sizeMm, width / 2, depth / 2);
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const points: RectanglePoint[] = [];
    const cornerSteps = treatment.style === 'rounded' ? Math.max(1, edgeSegments) : 1;
    const pushSide = (start: Point, end: Point, outward: Point, uStart: number, length: number) => {
        for (let step = 0; step < sideSegments; step += 1) {
            const along = step / sideSegments;
            points.push({
                point: [
                    start[0] + (end[0] - start[0]) * along,
                    start[1] + (end[1] - start[1]) * along,
                ],
                outward,
                alongSide: along,
                uMm: uStart + length * along,
            });
        }
    };
    const pushCorner = (center: Point, startAngle: number, uStart: number) => {
        for (let step = 0; step < cornerSteps; step += 1) {
            const along = step / cornerSteps;
            const angle = startAngle + (along * Math.PI) / 2;
            points.push({
                point: [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)],
                outward: [Math.cos(angle), Math.sin(angle)],
                alongSide: 0,
                uMm: uStart + 2 * r * along,
                corner: true,
            });
        }
    };
    pushSide([halfWidth, -halfDepth + r], [halfWidth, halfDepth - r], [1, 0], r, depth - 2 * r);
    pushCorner([halfWidth - r, halfDepth - r], 0, depth - r);
    pushSide(
        [halfWidth - r, halfDepth],
        [-halfWidth + r, halfDepth],
        [0, 1],
        depth + r,
        width - 2 * r,
    );
    pushCorner([-halfWidth + r, halfDepth - r], Math.PI / 2, depth + width - r);
    pushSide(
        [-halfWidth, halfDepth - r],
        [-halfWidth, -halfDepth + r],
        [-1, 0],
        depth + width + r,
        depth - 2 * r,
    );
    pushCorner([-halfWidth + r, -halfDepth + r], Math.PI, 2 * depth + width - r);
    pushSide(
        [-halfWidth + r, -halfDepth],
        [halfWidth - r, -halfDepth],
        [0, -1],
        2 * depth + width + r,
        width - 2 * r,
    );
    pushCorner([halfWidth - r, -halfDepth + r], Math.PI * 1.5, 2 * (depth + width) - r);
    return points;
}

function rectangleLoop(width: number, depth: number, sideSegments: number): RectanglePoint[] {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const points: RectanglePoint[] = [];
    const perimeterMm = 2 * (width + depth);
    let uMm = 0;

    const sides: Array<{ start: Point; end: Point; outward: Point }> = [
        { start: [halfWidth, -halfDepth], end: [halfWidth, halfDepth], outward: [1, 0] },
        { start: [halfWidth, halfDepth], end: [-halfWidth, halfDepth], outward: [0, 1] },
        { start: [-halfWidth, halfDepth], end: [-halfWidth, -halfDepth], outward: [-1, 0] },
        { start: [-halfWidth, -halfDepth], end: [halfWidth, -halfDepth], outward: [0, -1] },
    ];

    for (const side of sides) {
        const sideLength = Math.hypot(side.end[0] - side.start[0], side.end[1] - side.start[1]);
        for (let step = 0; step < sideSegments; step += 1) {
            const alongSide = step / sideSegments;
            points.push({
                point: [
                    side.start[0] + (side.end[0] - side.start[0]) * alongSide,
                    side.start[1] + (side.end[1] - side.start[1]) * alongSide,
                ],
                outward: side.outward,
                alongSide,
                uMm: uMm + sideLength * alongSide,
            });
        }
        uMm += sideLength;
    }

    // Keep this assertion close to the parametrization: it protects the seamless mapping contract.
    if (Math.abs(uMm - perimeterMm) > 0.0001) throw new Error('Invalid drawer perimeter mapping.');
    return points;
}

function drawerPerimeterPoint(
    width: number,
    depth: number,
    uMm: number,
): { point: Point; outward: Point } {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    const perimeter = 2 * (width + depth);
    let u = ((uMm % perimeter) + perimeter) % perimeter;
    if (u < depth) return { point: [halfWidth, -halfDepth + u], outward: [1, 0] };
    u -= depth;
    if (u < width) return { point: [halfWidth - u, halfDepth], outward: [0, 1] };
    u -= width;
    if (u < depth) return { point: [-halfWidth, halfDepth - u], outward: [-1, 0] };
    u -= depth;
    return { point: [-halfWidth + u, -halfDepth], outward: [0, -1] };
}

export function buildDrawerVectorTextureMeshes(
    parameters: DrawerParameters,
    texture: TextureConfig,
    textureWalls: DrawerTextureWalls,
    options: VectorReliefOptions,
): RawMesh[] {
    if (texture.kind === 'smooth' || texture.kind === 'noise') return [];
    const perimeter = 2 * (parameters.widthMm + parameters.depthMm);
    const result: RawMesh[] = [];
    const axialTreatment = defaultAxialEdgeTreatment(parameters);
    // Split every vector stroke at exact wall/corner boundaries. This keeps every
    // drawer face planar and makes diagonal guides genuinely straight on a wall.
    const cornerInset = resolveEdgeTreatmentSize(
        parameters.edgeTreatment,
        parameters.widthMm / 2,
        parameters.depthMm / 2,
    );
    const walls: Array<{ min: number; max: number; enabled: boolean }> = [
        { min: cornerInset, max: parameters.depthMm - cornerInset, enabled: textureWalls.sides },
        {
            min: parameters.depthMm + cornerInset,
            max: parameters.depthMm + parameters.widthMm - cornerInset,
            enabled: textureWalls.back,
        },
        {
            min: parameters.depthMm + parameters.widthMm + cornerInset,
            max: parameters.depthMm * 2 + parameters.widthMm - cornerInset,
            enabled: textureWalls.sides,
        },
        {
            min: parameters.depthMm * 2 + parameters.widthMm + cornerInset,
            max: perimeter - cornerInset,
            enabled: textureWalls.front,
        },
    ];
    const mapper: SurfaceMapper = (u, z, depth) => {
        const item = drawerPerimeterPoint(parameters.widthMm, parameters.depthMm, u);
        return [
            item.point[0] + item.outward[0] * depth,
            item.point[1] + item.outward[1] * depth,
            z,
        ];
    };
    const frontStart = parameters.depthMm * 2 + parameters.widthMm;
    const clearanceMm = Math.max(1, parameters.wallThicknessMm);
    const handleBounds = drawerHandleBounds(parameters);
    const handleMinU =
        frontStart + parameters.widthMm / 2 - handleBounds.envelopeWidthMm / 2 - clearanceMm;
    const handleMaxU =
        frontStart + parameters.widthMm / 2 + handleBounds.envelopeWidthMm / 2 + clearanceMm;
    const handleMinZ = handleBounds.bottomZMm - clearanceMm;
    const handleMaxZ = handleBounds.topZMm + clearanceMm;
    const [rawBandMinZ, rawBandMaxZ] = textureBand(texture, parameters.heightMm);
    const bandMinZ = Math.max(rawBandMinZ, axialTreatment.bottomSizeMm);
    const bandMaxZ = Math.min(rawBandMaxZ, parameters.heightMm - axialTreatment.topSizeMm);
    const regions = walls
        .flatMap((wall) => {
            if (!wall.enabled) return [];
            return wall.min !== frontStart
                ? [[wall.min, wall.max, bandMinZ, bandMaxZ] as const]
                : [
                      [wall.min, Math.min(wall.max, handleMinU), bandMinZ, bandMaxZ] as const,
                      [Math.max(wall.min, handleMaxU), wall.max, bandMinZ, bandMaxZ] as const,
                      [
                          Math.max(wall.min, handleMinU),
                          Math.min(wall.max, handleMaxU),
                          bandMinZ,
                          Math.min(bandMaxZ, handleMinZ),
                      ] as const,
                      [
                          Math.max(wall.min, handleMinU),
                          Math.min(wall.max, handleMaxU),
                          Math.max(bandMinZ, handleMaxZ),
                          bandMaxZ,
                      ] as const,
                  ];
        })
        .filter((region) => region[1] > region[0] && region[3] > region[2]);
    const segments = vectorTextureSegments(texture, perimeter, parameters.heightMm);
    if (!segments.length) return [];
    // Use the same direct path projection as the pot; wall and handle bounds
    // merely clip each path before its round caps are constructed.
    const copies =
        texture.kind === 'ribs'
            ? (() => {
                  const minSegmentU = Math.min(
                      ...segments.flatMap((segment) => [segment.a[0], segment.b[0]]),
                  );
                  const maxSegmentU = Math.max(
                      ...segments.flatMap((segment) => [segment.a[0], segment.b[0]]),
                  );
                  const first = Math.floor((0 - maxSegmentU) / perimeter) - 1;
                  const last = Math.ceil((perimeter - minSegmentU) / perimeter) + 1;
                  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
              })()
            : [0];
    for (const region of regions) {
        for (const copy of copies)
            for (const segment of segments) {
                const radius = segment.widthMm / 2;
                if (region[1] - region[0] <= radius * 2 || region[3] - region[2] <= radius * 2)
                    continue;
                const translated = {
                    a: [segment.a[0] + copy * perimeter, segment.a[1]] as Point,
                    b: [segment.b[0] + copy * perimeter, segment.b[1]] as Point,
                };
                const clipped = clipSegmentToRect(
                    translated.a,
                    translated.b,
                    region[0] + radius,
                    region[1] - radius,
                    region[2] + radius,
                    region[3] - radius,
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
    }
    return result;
}

export function buildDrawerOuterMesh(
    parameters: DrawerParameters,
    texture: TextureConfig,
    textureWalls: DrawerTextureWalls,
    tessellation: Tessellation,
): RawMesh {
    const hasTexturedWall = textureWalls.front || textureWalls.sides || textureWalls.back;
    const edgeSegments = tessellation.edgeSegments ?? 3;
    const axialTreatment = defaultAxialEdgeTreatment(parameters);
    const zLevels = verticalLevels(
        parameters.heightMm,
        texture.kind === 'smooth' || !hasTexturedWall ? 1 : tessellation.verticalSegments,
        parameters.edgeTreatment,
        axialTreatment,
        edgeSegments,
    );
    const baseLoop = treatedRectangleLoop(
        parameters.widthMm,
        parameters.depthMm,
        tessellation.drawerSideSegments,
        parameters.edgeTreatment,
        edgeSegments,
    );
    const loopSize = baseLoop.length;
    const positions: number[] = [];
    const indices: number[] = [];
    const perimeterMm = 2 * (parameters.widthMm + parameters.depthMm);

    for (const z of zLevels) {
        const edgeInset = edgeInsetAtZ(
            z,
            parameters.heightMm,
            parameters.edgeTreatment,
            axialTreatment,
        );
        const loop = treatedRectangleLoop(
            parameters.widthMm - 2 * edgeInset,
            parameters.depthMm - 2 * edgeInset,
            tessellation.drawerSideSegments,
            parameters.edgeTreatment,
            edgeSegments,
        );
        for (const item of loop) {
            // Suppress displacement around corners so adjacent wall samples meet
            // without overlaps, cracks, or corner-rounding behavior.
            const cornerDistance = Math.min(item.alongSide, 1 - item.alongSide);
            const cornerMask = Math.min(
                1,
                (cornerDistance * tessellation.drawerSideSegments) / 1.5,
            );
            const sample: SurfaceSample = {
                uMm: item.uMm,
                perimeterMm,
                zMm: z,
                heightMm: parameters.heightMm,
                xMm: item.point[0],
                yMm: item.point[1],
            };
            const structuralMask =
                cornerMask *
                drawerHandleClearanceMask(parameters, item, z) *
                drawerTextureWallMask(textureWalls, item);
            const displacement = hasTexturedWall
                ? textureDisplacement(texture, sample) * structuralMask
                : 0;
            positions.push(
                item.point[0] + item.outward[0] * displacement,
                item.point[1] + item.outward[1] * displacement,
                z,
            );
        }
    }

    for (let ring = 0; ring < zLevels.length - 1; ring += 1) {
        connectLoops(indices, ring * loopSize, (ring + 1) * loopSize, loopSize);
    }

    const bottomCenter = positions.length / 3;
    positions.push(0, 0, 0);
    capLoop(indices, 0, loopSize, bottomCenter, false);

    const topCenter = positions.length / 3;
    positions.push(0, 0, parameters.heightMm);
    capLoop(indices, (zLevels.length - 1) * loopSize, loopSize, topCenter, true);

    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Closed cutter for the drawer cavity, including its floor, rim and vertical-corner treatment. */
export function buildDrawerCavityMesh(
    parameters: DrawerParameters,
    tessellation: Tessellation,
): RawMesh {
    const treatment = parameters.edgeTreatment;
    const bottomZ = parameters.bottomThicknessMm;
    const topZ = parameters.heightMm + 1;
    const axialTreatment = defaultAxialEdgeTreatment(parameters);
    const edgeSegments = tessellation.edgeSegments ?? 3;
    const steps = treatment.style === 'rounded' ? edgeSegments : 1;
    const levels = new Set<number>([
        bottomZ,
        bottomZ + axialTreatment.bottomSizeMm,
        parameters.heightMm - axialTreatment.topSizeMm,
        topZ,
    ]);
    if (treatment.style !== 'none')
        for (let i = 0; i <= steps; i += 1) {
            levels.add(bottomZ + (axialTreatment.bottomSizeMm * i) / steps);
            levels.add(
                parameters.heightMm -
                    axialTreatment.topSizeMm +
                    (axialTreatment.topSizeMm * i) / steps,
            );
        }
    const zLevels = [...levels].filter((z) => z >= bottomZ && z <= topZ).sort((a, b) => a - b);
    const baseWidth = parameters.widthMm - 2 * parameters.wallThicknessMm;
    const baseDepth = parameters.depthMm - 2 * parameters.wallThicknessMm;
    const positions: number[] = [];
    const indices: number[] = [];
    let loopSize = 0;
    for (const z of zLevels) {
        let delta = 0;
        if (z < bottomZ + axialTreatment.bottomSizeMm) {
            delta = -edgeInsetForDistance(z - bottomZ, axialTreatment.bottomSizeMm, treatment);
        }
        if (z > parameters.heightMm - axialTreatment.topSizeMm) {
            delta =
                z >= parameters.heightMm
                    ? axialTreatment.topSizeMm
                    : edgeInsetForDistance(
                          parameters.heightMm - z,
                          axialTreatment.topSizeMm,
                          treatment,
                      );
        }
        const loop = treatedRectangleLoop(
            baseWidth + 2 * delta,
            baseDepth + 2 * delta,
            tessellation.drawerSideSegments,
            treatment,
            edgeSegments,
        );
        loopSize = loop.length;
        for (const item of loop) positions.push(item.point[0], item.point[1], z);
    }
    for (let ring = 0; ring < zLevels.length - 1; ring += 1)
        connectLoops(indices, ring * loopSize, (ring + 1) * loopSize, loopSize);
    const bottomCenter = positions.length / 3;
    positions.push(0, 0, bottomZ);
    capLoop(indices, 0, loopSize, bottomCenter, false);
    const topCenter = positions.length / 3;
    positions.push(0, 0, topZ);
    capLoop(indices, (zLevels.length - 1) * loopSize, loopSize, topCenter, true);
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Creates an X-axis triangular prism whose underside is at least 45 degrees. */
export function buildDrawerHandleMesh(parameters: DrawerParameters): RawMesh {
    const halfWidth = parameters.handleWidthMm / 2;
    const attachOverlap = Math.min(0.5, parameters.wallThicknessMm / 3);
    const wallY = -parameters.depthMm / 2 + attachOverlap;
    const outerY = -parameters.depthMm / 2 - parameters.handleDepthMm;
    const bounds = drawerHandleBounds(parameters);
    const lowerZ = bounds.bottomZMm;
    const topZ = bounds.topZMm;

    if (parameters.edgeTreatment.style !== 'none') {
        const treatment = parameters.edgeTreatment;
        const cornerSteps = treatment.style === 'rounded' ? 3 : 1;
        const triangle: Point[] = [
            [wallY, lowerZ],
            [wallY, topZ],
            [outerY, topZ],
        ];
        const profileHeightMm = topZ - lowerZ;
        const profileDepthMm = wallY - outerY;
        const profileHypotenuseMm = Math.hypot(profileHeightMm, profileDepthMm);
        const profileInradiusMm = (profileHeightMm + profileDepthMm - profileHypotenuseMm) / 2;
        const axialSizeMm = resolveEdgeTreatmentSize(treatment, halfWidth, profileInradiusMm);
        const profile: Point[] = [];
        for (let index = 0; index < triangle.length; index += 1) {
            const previous = triangle[(index + triangle.length - 1) % triangle.length];
            const vertex = triangle[index];
            const next = triangle[(index + 1) % triangle.length];
            // The lower and outer corners meet the intentionally sloped printable
            // underside, so they are not 90-degree edges and remain unchanged.
            if (index !== 1) {
                profile.push(vertex);
                continue;
            }
            const previousLength = Math.hypot(previous[0] - vertex[0], previous[1] - vertex[1]);
            const nextLength = Math.hypot(next[0] - vertex[0], next[1] - vertex[1]);
            const distance = Math.min(treatment.sizeMm, previousLength * 0.3, nextLength * 0.3);
            const start: Point = [
                vertex[0] + ((previous[0] - vertex[0]) * distance) / previousLength,
                vertex[1] + ((previous[1] - vertex[1]) * distance) / previousLength,
            ];
            const end: Point = [
                vertex[0] + ((next[0] - vertex[0]) * distance) / nextLength,
                vertex[1] + ((next[1] - vertex[1]) * distance) / nextLength,
            ];
            for (let step = 0; step <= cornerSteps; step += 1) {
                const t = step / cornerSteps;
                if (treatment.style === 'rounded') {
                    const inverse = 1 - t;
                    profile.push([
                        inverse * inverse * start[0] + 2 * inverse * t * vertex[0] + t * t * end[0],
                        inverse * inverse * start[1] + 2 * inverse * t * vertex[1] + t * t * end[1],
                    ]);
                } else profile.push(t === 0 ? start : end);
            }
        }
        const inset = insetConvexPolygon(profile, axialSizeMm);
        const axialSteps = treatment.style === 'rounded' ? 3 : 1;
        const layers: Array<{ x: number; blend: number }> = [];
        for (let step = 0; step <= axialSteps; step += 1) {
            const t = step / axialSteps;
            layers.push({
                x: -halfWidth + axialSizeMm * t,
                blend: treatment.style === 'rounded' ? Math.sin((t * Math.PI) / 2) : t,
            });
        }
        for (let step = 1; step <= axialSteps; step += 1) {
            const t = step / axialSteps;
            layers.push({
                x: halfWidth - axialSizeMm + axialSizeMm * t,
                blend: treatment.style === 'rounded' ? Math.cos((t * Math.PI) / 2) : 1 - t,
            });
        }
        const positions: number[] = [];
        const indices: number[] = [];
        const count = profile.length;
        for (const layer of layers)
            for (let index = 0; index < count; index += 1) {
                const point: Point = [
                    inset[index][0] + (profile[index][0] - inset[index][0]) * layer.blend,
                    inset[index][1] + (profile[index][1] - inset[index][1]) * layer.blend,
                ];
                positions.push(layer.x, point[0], point[1]);
            }
        for (let layer = 0; layer < layers.length - 1; layer += 1)
            connectLoops(indices, layer * count, (layer + 1) * count, count);
        for (let index = 1; index < count - 1; index += 1) indices.push(0, index + 1, index);
        const right = (layers.length - 1) * count;
        for (let index = 1; index < count - 1; index += 1)
            indices.push(right, right + index, right + index + 1);
        return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
    }

    const positions = new Float32Array([
        -halfWidth,
        wallY,
        lowerZ,
        -halfWidth,
        wallY,
        topZ,
        -halfWidth,
        outerY,
        topZ,
        halfWidth,
        wallY,
        lowerZ,
        halfWidth,
        wallY,
        topZ,
        halfWidth,
        outerY,
        topZ,
    ]);

    // The two end triangles and three rectangular faces are wound outwards.
    const indices = new Uint32Array([
        0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3,
    ]);

    return { positions, indices };
}

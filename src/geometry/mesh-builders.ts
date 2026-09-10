import type { DrawerParameters, DrawerTextureWalls, EdgeTreatment, PotParameters, TextureConfig } from '../domain/design'
import { textureDisplacement, type SurfaceSample } from './textures'
import { vectorTextureSegments, type Point } from './vector-textures'

export type RawMesh = {
  positions: Float32Array
  indices: Uint32Array
}

export type Tessellation = {
  circularSegments: number
  verticalSegments: number
  drawerSideSegments: number
  edgeSegments?: number
}

export type VectorReliefOptions = { carrierSagittaMm: number; chordErrorMm: number }

export function potTexturePerimeter(parameters: PotParameters): number {
  const midpointRadius = (parameters.bottomDiameterMm + parameters.topDiameterMm) / 4
  return Math.PI * 2 * midpointRadius
}

function treatedPotRadius(parameters: PotParameters, zMm: number): number {
  const bottomRadius = parameters.bottomDiameterMm / 2
  const topRadius = parameters.topDiameterMm / 2
  if (parameters.edgeTreatment.style === 'none') return bottomRadius + (topRadius - bottomRadius) * zMm / parameters.heightMm
  const size = parameters.edgeTreatment.sizeMm
  const usableHeight = Math.max(1e-6, parameters.heightMm - 2 * size)
  const sideZ = Math.max(size, Math.min(parameters.heightMm - size, zMm))
  return bottomRadius + (topRadius - bottomRadius) * (sideZ - size) / usableHeight
}

type Point2 = readonly [number, number]

function capLoop(indices: number[], loopStart: number, count: number, centerIndex: number, top: boolean): void {
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count
    if (top) indices.push(centerIndex, loopStart + i, loopStart + next)
    else indices.push(centerIndex, loopStart + next, loopStart + i)
  }
}

function connectLoops(indices: number[], lowerStart: number, upperStart: number, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const next = (i + 1) % count
    const a = lowerStart + i
    const b = lowerStart + next
    const c = upperStart + next
    const d = upperStart + i
    indices.push(a, b, c, a, c, d)
  }
}

export function buildPotOuterMesh(parameters: PotParameters, texture: TextureConfig, tessellation: Tessellation): RawMesh {
  const segments = tessellation.circularSegments
  const positions: number[] = []
  const indices: number[] = []
  // Use one cylindrical texture domain for every height ring. Recomputing the
  // wrapped width from each tapered ring makes periodic features split as z changes.
  const texturePerimeterMm = potTexturePerimeter(parameters)

  const zLevels = verticalLevels(parameters.heightMm, texture.kind === 'smooth' ? 1 : tessellation.verticalSegments, parameters.edgeTreatment, tessellation.edgeSegments ?? 3)

  for (const z of zLevels) {
    const radius = treatedPotRadius(parameters, z)
    const edgeInset = edgeInsetAtZ(z, parameters.heightMm, parameters.edgeTreatment)

    for (let segment = 0; segment < segments; segment += 1) {
      const along = segment / segments
      const angle = along * Math.PI * 2
      const xMm = radius * Math.cos(angle)
      const yMm = radius * Math.sin(angle)
      const displacement = textureDisplacement(texture, { uMm: along * texturePerimeterMm, perimeterMm: texturePerimeterMm, zMm: z, heightMm: parameters.heightMm, xMm, yMm })
      const texturedRadius = radius - edgeInset + (edgeInset < 1e-7 ? displacement : 0)
      positions.push(texturedRadius * Math.cos(angle), texturedRadius * Math.sin(angle), z)
    }
  }

  for (let ring = 0; ring < zLevels.length - 1; ring += 1) {
    connectLoops(indices, ring * segments, (ring + 1) * segments, segments)
  }

  const bottomCenter = positions.length / 3
  positions.push(0, 0, 0)
  capLoop(indices, 0, segments, bottomCenter, false)

  const topCenter = positions.length / 3
  positions.push(0, 0, parameters.heightMm)
  capLoop(indices, (zLevels.length - 1) * segments, segments, topCenter, true)

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

function coverageDepth(texture: Exclude<TextureConfig, { kind: 'smooth' }>, zMm: number, heightMm: number): number {
  const bandHeight = heightMm * texture.coveragePercent / 100
  const start = (heightMm - bandHeight) / 2; const end = start + bandHeight
  if (zMm < start || zMm > end) return 0
  if (texture.kind === 'ribs') return (texture.reliefMode === 'emboss' ? 1 : -1) * texture.depthMm
  const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t) }
  const fade = Math.min(
    texture.bottomFadeMm ? smooth((zMm - start) / texture.bottomFadeMm) : 1,
    texture.topFadeMm ? smooth((end - zMm) / texture.topFadeMm) : 1,
  )
  return (texture.reliefMode === 'emboss' ? 1 : -1) * texture.depthMm * fade
}

function textureBand(texture: Exclude<TextureConfig, { kind: 'smooth' }>, heightMm: number): readonly [number, number] {
  const bandHeight = heightMm * texture.coveragePercent / 100
  return [(heightMm - bandHeight) / 2, (heightMm + bandHeight) / 2]
}

type SurfaceMapper = (uMm: number, zMm: number, displacementMm: number) => readonly [number, number, number]
type RoundedPathTexture = Extract<TextureConfig, { kind: 'ribs' | 'honeycomb' | 'voronoi' }>

function clipSegmentToRect(a: Point, b: Point, minU: number, maxU: number, minZ: number, maxZ: number): readonly [Point, Point] | undefined {
  const delta: Point = [b[0] - a[0], b[1] - a[1]]
  let low = 0; let high = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const ratio = q / p
    if (p < 0) low = Math.max(low, ratio)
    else high = Math.min(high, ratio)
    return low <= high
  }
  if (!clip(-delta[0], a[0] - minU) || !clip(delta[0], maxU - a[0]) || !clip(-delta[1], a[1] - minZ) || !clip(delta[1], maxZ - a[1])) return undefined
  return [
    [a[0] + delta[0] * low, a[1] + delta[1] * low],
    [a[0] + delta[0] * high, a[1] + delta[1] * high],
  ]
}

function adaptiveAxisParameters(a: Point, b: Point, map: SurfaceMapper, errorMm: number): number[] {
  const values = [0]
  const walk = (from: number, to: number, depth: number): void => {
    const midpoint = (from + to) / 2
    const uv = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const p0 = map(...uv(from), 0); const p1 = map(...uv(to), 0); const pm = map(...uv(midpoint), 0)
    const error = Math.hypot(pm[0] - (p0[0] + p1[0]) / 2, pm[1] - (p0[1] + p1[1]) / 2, pm[2] - (p0[2] + p1[2]) / 2)
    if (depth < 12 && error > errorMm) { walk(from, midpoint, depth + 1); walk(midpoint, to, depth + 1); return }
    values.push(to)
  }
  walk(0, 1, 0)
  return values
}

function arcSegments(radiusMm: number, angleRad: number, chordErrorMm: number): number {
  const cosine = Math.max(-1, Math.min(1, 1 - Math.max(1e-6, chordErrorMm) / radiusMm))
  const maxAngle = 2 * Math.acos(cosine)
  return Math.max(2, Math.ceil(angleRad / Math.max(1e-3, maxAngle)))
}

/** A round-capped half-cylinder projected along one path on the carrier surface. */
function roundedPathMesh(
  segment: { a: Point; b: Point; widthMm: number },
  texture: RoundedPathTexture,
  heightMm: number,
  map: SurfaceMapper,
  options: VectorReliefOptions,
): RawMesh | undefined {
  const dx = segment.b[0] - segment.a[0]; const dz = segment.b[1] - segment.a[1]
  const length = Math.hypot(dx, dz); const radius = segment.widthMm / 2
  if (length < 1e-7 || radius <= 0 || texture.depthMm <= 0) return undefined
  const along: Point = [dx / length, dz / length]
  const across: Point = [-along[1], along[0]]
  const profileRadius = Math.max(radius, texture.depthMm)
  const radialSegments = Math.max(4, arcSegments(profileRadius, Math.PI, options.chordErrorMm))
  const capSegments = arcSegments(profileRadius, Math.PI / 2, options.chordErrorMm)
  const axisParameters = adaptiveAxisParameters(segment.a, segment.b, map, options.chordErrorMm)
  const rings: Array<{ distance: number; crossRadius: number }> = []
  for (let i = 1; i <= capSegments; i += 1) {
    const angle = (capSegments - i) / capSegments * Math.PI / 2
    rings.push({ distance: -radius * Math.sin(angle), crossRadius: radius * Math.cos(angle) })
  }
  for (const t of axisParameters.slice(1, -1)) rings.push({ distance: length * t, crossRadius: radius })
  for (let i = 0; i < capSegments; i += 1) {
    const angle = i / capSegments * Math.PI / 2
    rings.push({ distance: length + radius * Math.sin(angle), crossRadius: radius * Math.cos(angle) })
  }

  const positions: number[] = []; const indices: number[] = []
  const sign = texture.reliefMode === 'emboss' ? 1 : -1
  const overlap = options.carrierSagittaMm + options.chordErrorMm + .01
  const mapped = (distance: number, transverse: number, profile: number) => {
    const u = segment.a[0] + along[0] * distance + across[0] * transverse
    const z = segment.a[1] + along[1] * distance + across[1] * transverse
    return map(u, z, profile * Math.abs(coverageDepth(texture, z, heightMm)))
  }
  const aTip = positions.length / 3
  positions.push(...mapped(-radius, 0, 0))
  const ringStarts: number[] = []
  for (const ring of rings) {
    ringStarts.push(positions.length / 3)
    for (let side = 0; side <= radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI
      positions.push(...mapped(ring.distance, ring.crossRadius * Math.cos(angle), sign * ring.crossRadius / radius * Math.sin(angle)))
    }
  }
  const bTip = positions.length / 3
  positions.push(...mapped(length + radius, 0, 0))
  for (let side = 0; side < radialSegments; side += 1) indices.push(aTip, ringStarts[0] + side, ringStarts[0] + side + 1)
  for (let ring = 0; ring < ringStarts.length - 1; ring += 1) {
    for (let side = 0; side < radialSegments; side += 1) {
      const a = ringStarts[ring] + side; const b = ringStarts[ring + 1] + side
      indices.push(a, b, b + 1, a, b + 1, a + 1)
    }
  }
  const lastRing = ringStarts[ringStarts.length - 1]
  for (let side = 0; side < radialSegments; side += 1) indices.push(lastRing + side, bTip, lastRing + side + 1)

  const boundary = [aTip, ...ringStarts, bTip, ...[...ringStarts].reverse().map((start) => start + radialSegments)]
  const embedded: number[] = []
  for (const outerIndex of boundary) {
    // Re-map the boundary point rather than offsetting in world space so tapered
    // pots and drawer faces use the same carrier-normal convention.
    const source = outerIndex === aTip
      ? { distance: -radius, transverse: 0 }
      : outerIndex === bTip
        ? { distance: length + radius, transverse: 0 }
        : (() => {
            const ringIndex = ringStarts.findIndex((start) => outerIndex === start || outerIndex === start + radialSegments)
            return { distance: rings[ringIndex].distance, transverse: outerIndex === ringStarts[ringIndex] ? rings[ringIndex].crossRadius : -rings[ringIndex].crossRadius }
          })()
    embedded.push(positions.length / 3)
    const u = segment.a[0] + along[0] * source.distance + across[0] * source.transverse
    const z = segment.a[1] + along[1] * source.distance + across[1] * source.transverse
    positions.push(...map(u, z, -sign * overlap))
  }
  for (let i = 0; i < boundary.length; i += 1) {
    const next = (i + 1) % boundary.length
    indices.push(boundary[i], embedded[i], embedded[next], boundary[i], embedded[next], boundary[next])
  }
  const baseCenter = positions.length / 3
  {
    const u = segment.a[0] + along[0] * length / 2
    const z = segment.a[1] + along[1] * length / 2
    positions.push(...map(u, z, -sign * overlap))
  }
  for (let i = 0; i < embedded.length; i += 1) indices.push(baseCenter, embedded[(i + 1) % embedded.length], embedded[i])
  if (texture.reliefMode === 'emboss') for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

function insetConvexPolygon(polygon: Point[], requestedInsetMm: number): Point[] {
  const centroid = polygon.reduce<Point>((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0, 0])
  const edgeDistance = (a: Point, b: Point) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return ((b[0] - a[0]) * (centroid[1] - a[1]) - (b[1] - a[1]) * (centroid[0] - a[0])) / length
  }
  const minimumEdgeDistance = Math.min(...polygon.map((point, index) => edgeDistance(point, polygon[(index + 1) % polygon.length])))
  const insetMm = Math.max(0, Math.min(requestedInsetMm, minimumEdgeDistance * 0.45))
  return polygon.map((point, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const next = polygon[(index + 1) % polygon.length]
    const previousLength = Math.hypot(point[0] - previous[0], point[1] - previous[1]) || 1
    const nextLength = Math.hypot(next[0] - point[0], next[1] - point[1]) || 1
    const previousNormal: Point = [-(point[1] - previous[1]) / previousLength, (point[0] - previous[0]) / previousLength]
    const nextNormal: Point = [-(next[1] - point[1]) / nextLength, (next[0] - point[0]) / nextLength]
    const denominator = 1 + previousNormal[0] * nextNormal[0] + previousNormal[1] * nextNormal[1]
    if (denominator < 1e-8) return [point[0] + previousNormal[0] * insetMm, point[1] + previousNormal[1] * insetMm]
    return [
      point[0] + (previousNormal[0] + nextNormal[0]) * insetMm / denominator,
      point[1] + (previousNormal[1] + nextNormal[1]) * insetMm / denominator,
    ]
  })
}

function potMapper(parameters: PotParameters, perimeterMm: number, baseInsetMm: number): SurfaceMapper {
  return (u, z, depth) => {
    const radius = treatedPotRadius(parameters, z) + depth + baseInsetMm
    const angle = u / perimeterMm * Math.PI * 2
    return [radius * Math.cos(angle), radius * Math.sin(angle), z]
  }
}

/**
 * Builds relief as vector-defined solids on top of the smooth shell.  Each
 * path edge is a mesh edge; there is intentionally no UV sampling grid here.
 */
export function buildPotVectorTextureMeshes(parameters: PotParameters, texture: TextureConfig, options: VectorReliefOptions): RawMesh[] {
  if (texture.kind === 'smooth' || texture.kind === 'noise') return []
  const perimeter = potTexturePerimeter(parameters)
  // The carrier shell is a chordal approximation of the analytic frustum.
  // Overlap it by more than the stated chord error so booleans weld, rather
  // than merely touching two independently tessellated surfaces.
  const mapper = potMapper(parameters, perimeter, 0)
  const result: RawMesh[] = []
  const edgeInset = parameters.edgeTreatment.style === 'none' ? 0 : parameters.edgeTreatment.sizeMm
  const [bandMinZ, bandMaxZ] = textureBand(texture, parameters.heightMm)
  const minZ = Math.max(bandMinZ, edgeInset)
  const maxZ = Math.min(bandMaxZ, parameters.heightMm - edgeInset)
  const segments = vectorTextureSegments(texture, perimeter, parameters.heightMm)
  // Every vector texture is one projected capsule per clipped centreline.
  // Periodic cell textures keep exactly one representative of each wrapped edge.
  const paths = texture.kind === 'ribs'
    ? segments
    : segments.filter((segment) => {
        const midpointU = (segment.a[0] + segment.b[0]) / 2
        return midpointU >= 0 && midpointU < perimeter
      })
  for (const segment of paths) {
    const radius = segment.widthMm / 2
    const clipped = clipSegmentToRect(segment.a, segment.b, -1e12, 1e12, minZ + radius, maxZ - radius)
    if (!clipped) continue
    const mesh = roundedPathMesh({ a: clipped[0], b: clipped[1], widthMm: segment.widthMm }, texture, parameters.heightMm, mapper, options)
    if (mesh) result.push(mesh)
  }
  return result
}

type RectanglePoint = {
  point: Point2
  outward: Point2
  alongSide: number
  uMm: number
  corner?: boolean
}

function edgeInsetAtZ(zMm: number, heightMm: number, treatment: EdgeTreatment): number {
  if (treatment.style === 'none') return 0
  const distance = Math.min(zMm, heightMm - zMm)
  if (distance >= treatment.sizeMm) return 0
  if (treatment.style === 'chamfered') return treatment.sizeMm - distance
  return treatment.sizeMm - Math.sqrt(Math.max(0, treatment.sizeMm ** 2 - (distance - treatment.sizeMm) ** 2))
}

function verticalLevels(heightMm: number, divisions: number, treatment: EdgeTreatment, edgeSegments: number): number[] {
  const levels = new Set<number>()
  for (let index = 0; index <= divisions; index += 1) levels.add(heightMm * index / divisions)
  if (treatment.style !== 'none') {
    const steps = treatment.style === 'rounded' ? edgeSegments : 1
    for (let index = 0; index <= steps; index += 1) {
      const z = treatment.sizeMm * index / steps
      levels.add(z); levels.add(heightMm - z)
    }
  }
  return [...levels].sort((a, b) => a - b)
}

function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

export type DrawerHandleBounds = {
  envelopeWidthMm: number
  envelopeHeightMm: number
  bottomZMm: number
  topZMm: number
  openingBottomZMm: number
  openingTopZMm: number
}

/** Resolves normalized top-to-bottom placement for the complete handle assembly. */
export function drawerHandleBounds(parameters: DrawerParameters): DrawerHandleBounds {
  const shellMm = parameters.handleStyle === 'recessed' ? parameters.wallThicknessMm : 0
  const envelopeWidthMm = parameters.handleWidthMm + 2 * shellMm
  const envelopeHeightMm = parameters.handleHeightMm + 2 * shellMm
  const travelMm = Math.max(0, parameters.heightMm - envelopeHeightMm)
  const bottomZMm = travelMm * (1 - parameters.handlePositionPercent / 100)
  return {
    envelopeWidthMm,
    envelopeHeightMm,
    bottomZMm,
    topZMm: bottomZMm + envelopeHeightMm,
    openingBottomZMm: bottomZMm + shellMm,
    openingTopZMm: bottomZMm + envelopeHeightMm - shellMm,
  }
}

/** Keeps the front-wall texture out of the handle assembly and its print clearance. */
function drawerHandleClearanceMask(parameters: DrawerParameters, item: RectanglePoint, zMm: number): number {
  if (item.outward[1] !== -1) return 1
  const clearanceMm = Math.max(1, parameters.wallThicknessMm)
  const bounds = drawerHandleBounds(parameters)
  const horizontalOutside = smoothstep01((Math.abs(item.point[0]) - bounds.envelopeWidthMm / 2) / clearanceMm)
  const below = smoothstep01((bounds.bottomZMm - zMm) / clearanceMm)
  const above = smoothstep01((zMm - bounds.topZMm) / clearanceMm)
  const verticalOutside = Math.max(below, above)
  return 1 - (1 - horizontalOutside) * (1 - verticalOutside)
}

function drawerTextureWallMask(textureWalls: DrawerTextureWalls, item: RectanglePoint): number {
  if (item.corner) return 0
  if (item.outward[1] === -1) return Number(textureWalls.front)
  if (item.outward[1] === 1) return Number(textureWalls.back)
  return Number(textureWalls.sides)
}

function treatedRectangleLoop(width: number, depth: number, sideSegments: number, treatment: EdgeTreatment, edgeSegments: number): RectanglePoint[] {
  if (treatment.style === 'none') return rectangleLoop(width, depth, sideSegments)
  const r = Math.min(treatment.sizeMm, width / 2, depth / 2)
  const halfWidth = width / 2; const halfDepth = depth / 2
  const points: RectanglePoint[] = []
  const cornerSteps = treatment.style === 'rounded' ? Math.max(1, edgeSegments) : 1
  const pushSide = (start: Point2, end: Point2, outward: Point2, uStart: number, length: number) => {
    for (let step = 0; step < sideSegments; step += 1) {
      const along = step / sideSegments
      points.push({ point: [start[0] + (end[0] - start[0]) * along, start[1] + (end[1] - start[1]) * along], outward, alongSide: along, uMm: uStart + length * along })
    }
  }
  const pushCorner = (center: Point2, startAngle: number, uStart: number) => {
    for (let step = 0; step < cornerSteps; step += 1) {
      const along = step / cornerSteps
      const angle = startAngle + along * Math.PI / 2
      points.push({ point: [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)], outward: [Math.cos(angle), Math.sin(angle)], alongSide: 0, uMm: uStart + 2 * r * along, corner: true })
    }
  }
  pushSide([halfWidth, -halfDepth + r], [halfWidth, halfDepth - r], [1, 0], r, depth - 2 * r)
  pushCorner([halfWidth - r, halfDepth - r], 0, depth - r)
  pushSide([halfWidth - r, halfDepth], [-halfWidth + r, halfDepth], [0, 1], depth + r, width - 2 * r)
  pushCorner([-halfWidth + r, halfDepth - r], Math.PI / 2, depth + width - r)
  pushSide([-halfWidth, halfDepth - r], [-halfWidth, -halfDepth + r], [-1, 0], depth + width + r, depth - 2 * r)
  pushCorner([-halfWidth + r, -halfDepth + r], Math.PI, 2 * depth + width - r)
  pushSide([-halfWidth + r, -halfDepth], [halfWidth - r, -halfDepth], [0, -1], 2 * depth + width + r, width - 2 * r)
  pushCorner([halfWidth - r, -halfDepth + r], Math.PI * 1.5, 2 * (depth + width) - r)
  return points
}

function rectangleLoop(width: number, depth: number, sideSegments: number): RectanglePoint[] {
  const halfWidth = width / 2
  const halfDepth = depth / 2
  const points: RectanglePoint[] = []
  const perimeterMm = 2 * (width + depth)
  let uMm = 0

  const sides: Array<{ start: Point2; end: Point2; outward: Point2 }> = [
    { start: [halfWidth, -halfDepth], end: [halfWidth, halfDepth], outward: [1, 0] },
    { start: [halfWidth, halfDepth], end: [-halfWidth, halfDepth], outward: [0, 1] },
    { start: [-halfWidth, halfDepth], end: [-halfWidth, -halfDepth], outward: [-1, 0] },
    { start: [-halfWidth, -halfDepth], end: [halfWidth, -halfDepth], outward: [0, -1] },
  ]

  for (const side of sides) {
    const sideLength = Math.hypot(side.end[0] - side.start[0], side.end[1] - side.start[1])
    for (let step = 0; step < sideSegments; step += 1) {
      const alongSide = step / sideSegments
      points.push({
        point: [
          side.start[0] + (side.end[0] - side.start[0]) * alongSide,
          side.start[1] + (side.end[1] - side.start[1]) * alongSide,
        ],
        outward: side.outward,
        alongSide,
        uMm: uMm + sideLength * alongSide,
      })
    }
    uMm += sideLength
  }

  // Keep this assertion close to the parametrization: it protects the seamless mapping contract.
  if (Math.abs(uMm - perimeterMm) > 0.0001) throw new Error('Invalid drawer perimeter mapping.')
  return points
}

function drawerPerimeterPoint(width: number, depth: number, uMm: number): { point: Point2; outward: Point2 } {
  const halfWidth = width / 2; const halfDepth = depth / 2
  const perimeter = 2 * (width + depth); let u = ((uMm % perimeter) + perimeter) % perimeter
  if (u < depth) return { point: [halfWidth, -halfDepth + u], outward: [1, 0] }
  u -= depth
  if (u < width) return { point: [halfWidth - u, halfDepth], outward: [0, 1] }
  u -= width
  if (u < depth) return { point: [-halfWidth, halfDepth - u], outward: [-1, 0] }
  u -= depth
  return { point: [-halfWidth + u, -halfDepth], outward: [0, -1] }
}

export function buildDrawerVectorTextureMeshes(
  parameters: DrawerParameters,
  texture: TextureConfig,
  textureWalls: DrawerTextureWalls,
  options: VectorReliefOptions,
): RawMesh[] {
  if (texture.kind === 'smooth' || texture.kind === 'noise') return []
  const perimeter = 2 * (parameters.widthMm + parameters.depthMm)
  const result: RawMesh[] = []
  // Split every vector stroke at exact wall/corner boundaries. This keeps every
  // drawer face planar and makes diagonal guides genuinely straight on a wall.
  const edgeInset = parameters.edgeTreatment.style === 'none' ? 0 : parameters.edgeTreatment.sizeMm
  const walls: Array<{ min: number; max: number; enabled: boolean }> = [
    { min: edgeInset, max: parameters.depthMm - edgeInset, enabled: textureWalls.sides },
    { min: parameters.depthMm + edgeInset, max: parameters.depthMm + parameters.widthMm - edgeInset, enabled: textureWalls.back },
    { min: parameters.depthMm + parameters.widthMm + edgeInset, max: parameters.depthMm * 2 + parameters.widthMm - edgeInset, enabled: textureWalls.sides },
    { min: parameters.depthMm * 2 + parameters.widthMm + edgeInset, max: perimeter - edgeInset, enabled: textureWalls.front },
  ]
  const mapper: SurfaceMapper = (u, z, depth) => {
    const item = drawerPerimeterPoint(parameters.widthMm, parameters.depthMm, u)
    return [item.point[0] + item.outward[0] * depth, item.point[1] + item.outward[1] * depth, z]
  }
  const frontStart = parameters.depthMm * 2 + parameters.widthMm
  const clearanceMm = Math.max(1, parameters.wallThicknessMm)
  const handleBounds = drawerHandleBounds(parameters)
  const handleMinU = frontStart + parameters.widthMm / 2 - handleBounds.envelopeWidthMm / 2 - clearanceMm
  const handleMaxU = frontStart + parameters.widthMm / 2 + handleBounds.envelopeWidthMm / 2 + clearanceMm
  const handleMinZ = handleBounds.bottomZMm - clearanceMm
  const handleMaxZ = handleBounds.topZMm + clearanceMm
  const [rawBandMinZ, rawBandMaxZ] = textureBand(texture, parameters.heightMm)
  const bandMinZ = Math.max(rawBandMinZ, edgeInset)
  const bandMaxZ = Math.min(rawBandMaxZ, parameters.heightMm - edgeInset)
  const regions = walls.flatMap((wall) => {
    if (!wall.enabled) return []
    return wall.min !== frontStart
      ? [[wall.min, wall.max, bandMinZ, bandMaxZ] as const]
      : [
        [wall.min, Math.min(wall.max, handleMinU), bandMinZ, bandMaxZ] as const,
        [Math.max(wall.min, handleMaxU), wall.max, bandMinZ, bandMaxZ] as const,
        [Math.max(wall.min, handleMinU), Math.min(wall.max, handleMaxU), bandMinZ, Math.min(bandMaxZ, handleMinZ)] as const,
        [Math.max(wall.min, handleMinU), Math.min(wall.max, handleMaxU), Math.max(bandMinZ, handleMaxZ), bandMaxZ] as const,
      ]
  }).filter((region) => region[1] > region[0] && region[3] > region[2])
  const segments = vectorTextureSegments(texture, perimeter, parameters.heightMm)
  // Use the same direct path projection as the pot; wall and handle bounds
  // merely clip each path before its round caps are constructed.
  const copies = texture.kind === 'ribs'
    ? (() => {
        const minSegmentU = Math.min(...segments.flatMap((segment) => [segment.a[0], segment.b[0]]))
        const maxSegmentU = Math.max(...segments.flatMap((segment) => [segment.a[0], segment.b[0]]))
        const first = Math.floor((0 - maxSegmentU) / perimeter) - 1
        const last = Math.ceil((perimeter - minSegmentU) / perimeter) + 1
        return Array.from({ length: last - first + 1 }, (_, index) => first + index)
      })()
    : [0]
  for (const region of regions) {
    for (const copy of copies) for (const segment of segments) {
      const radius = segment.widthMm / 2
      if (region[1] - region[0] <= radius * 2 || region[3] - region[2] <= radius * 2) continue
      const translated = { a: [segment.a[0] + copy * perimeter, segment.a[1]] as Point, b: [segment.b[0] + copy * perimeter, segment.b[1]] as Point }
      const clipped = clipSegmentToRect(translated.a, translated.b, region[0] + radius, region[1] - radius, region[2] + radius, region[3] - radius)
      if (!clipped) continue
      const mesh = roundedPathMesh({ a: clipped[0], b: clipped[1], widthMm: segment.widthMm }, texture, parameters.heightMm, mapper, options)
      if (mesh) result.push(mesh)
    }
  }
  return result
}

export function buildDrawerOuterMesh(
  parameters: DrawerParameters,
  texture: TextureConfig,
  textureWalls: DrawerTextureWalls,
  tessellation: Tessellation,
): RawMesh {
  const hasTexturedWall = textureWalls.front || textureWalls.sides || textureWalls.back
  const edgeSegments = tessellation.edgeSegments ?? 3
  const zLevels = verticalLevels(parameters.heightMm, texture.kind === 'smooth' || !hasTexturedWall ? 1 : tessellation.verticalSegments, parameters.edgeTreatment, edgeSegments)
  const baseLoop = treatedRectangleLoop(parameters.widthMm, parameters.depthMm, tessellation.drawerSideSegments, parameters.edgeTreatment, edgeSegments)
  const loopSize = baseLoop.length
  const positions: number[] = []
  const indices: number[] = []
  const perimeterMm = 2 * (parameters.widthMm + parameters.depthMm)

  for (const z of zLevels) {
    const edgeInset = edgeInsetAtZ(z, parameters.heightMm, parameters.edgeTreatment)
    const loop = treatedRectangleLoop(parameters.widthMm - 2 * edgeInset, parameters.depthMm - 2 * edgeInset, tessellation.drawerSideSegments, parameters.edgeTreatment, edgeSegments)
    for (const item of loop) {
      // Suppress displacement around corners so adjacent wall samples meet
      // without overlaps, cracks, or corner-rounding behavior.
      const cornerDistance = Math.min(item.alongSide, 1 - item.alongSide)
      const cornerMask = Math.min(1, cornerDistance * tessellation.drawerSideSegments / 1.5)
      const sample: SurfaceSample = { uMm: item.uMm, perimeterMm, zMm: z, heightMm: parameters.heightMm, xMm: item.point[0], yMm: item.point[1] }
      const structuralMask = cornerMask
        * drawerHandleClearanceMask(parameters, item, z)
        * drawerTextureWallMask(textureWalls, item)
      const displacement = hasTexturedWall ? textureDisplacement(texture, sample) * structuralMask : 0
      positions.push(
        item.point[0] + item.outward[0] * displacement,
        item.point[1] + item.outward[1] * displacement,
        z,
      )
    }
  }

  for (let ring = 0; ring < zLevels.length - 1; ring += 1) {
    connectLoops(indices, ring * loopSize, (ring + 1) * loopSize, loopSize)
  }

  const bottomCenter = positions.length / 3
  positions.push(0, 0, 0)
  capLoop(indices, 0, loopSize, bottomCenter, false)

  const topCenter = positions.length / 3
  positions.push(0, 0, parameters.heightMm)
  capLoop(indices, (zLevels.length - 1) * loopSize, loopSize, topCenter, true)

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** Closed cutter for the drawer cavity, including its floor, rim and vertical-corner treatment. */
export function buildDrawerCavityMesh(parameters: DrawerParameters, tessellation: Tessellation): RawMesh {
  const treatment = parameters.edgeTreatment
  const bottomZ = parameters.bottomThicknessMm
  const topZ = parameters.heightMm + 1
  const size = treatment.style === 'none' ? 0 : treatment.sizeMm
  const edgeSegments = tessellation.edgeSegments ?? 3
  const steps = treatment.style === 'rounded' ? edgeSegments : 1
  const levels = new Set<number>([bottomZ, bottomZ + size, parameters.heightMm - size, topZ])
  if (size > 0) for (let i = 0; i <= steps; i += 1) {
    levels.add(bottomZ + size * i / steps)
    levels.add(parameters.heightMm - size + size * i / steps)
  }
  const zLevels = [...levels].filter((z) => z >= bottomZ && z <= topZ).sort((a, b) => a - b)
  const baseWidth = parameters.widthMm - 2 * parameters.wallThicknessMm
  const baseDepth = parameters.depthMm - 2 * parameters.wallThicknessMm
  const positions: number[] = []; const indices: number[] = []
  let loopSize = 0
  for (const z of zLevels) {
    let delta = 0
    if (size > 0 && z < bottomZ + size) delta = -edgeInsetAtZ(z - bottomZ, size * 2, treatment)
    if (size > 0 && z > parameters.heightMm - size) delta = z >= parameters.heightMm ? size : edgeInsetAtZ(parameters.heightMm - z, size * 2, treatment)
    const loop = treatedRectangleLoop(baseWidth + 2 * delta, baseDepth + 2 * delta, tessellation.drawerSideSegments, treatment, edgeSegments)
    loopSize = loop.length
    for (const item of loop) positions.push(item.point[0], item.point[1], z)
  }
  for (let ring = 0; ring < zLevels.length - 1; ring += 1) connectLoops(indices, ring * loopSize, (ring + 1) * loopSize, loopSize)
  const bottomCenter = positions.length / 3; positions.push(0, 0, bottomZ); capLoop(indices, 0, loopSize, bottomCenter, false)
  const topCenter = positions.length / 3; positions.push(0, 0, topZ); capLoop(indices, (zLevels.length - 1) * loopSize, loopSize, topCenter, true)
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** Creates an X-axis triangular prism whose underside is at least 45 degrees. */
export function buildDrawerHandleMesh(parameters: DrawerParameters): RawMesh {
  const halfWidth = parameters.handleWidthMm / 2
  const attachOverlap = Math.min(0.5, parameters.wallThicknessMm / 3)
  const wallY = -parameters.depthMm / 2 + attachOverlap
  const outerY = -parameters.depthMm / 2 - parameters.handleDepthMm
  const bounds = drawerHandleBounds(parameters)
  const lowerZ = bounds.bottomZMm
  const topZ = bounds.topZMm

  if (parameters.edgeTreatment.style !== 'none') {
    const treatment = parameters.edgeTreatment
    const cornerSteps = treatment.style === 'rounded' ? 3 : 1
    const triangle: Point[] = [[wallY, lowerZ], [wallY, topZ], [outerY, topZ]]
    const profile: Point[] = []
    for (let index = 0; index < triangle.length; index += 1) {
      const previous = triangle[(index + triangle.length - 1) % triangle.length]
      const vertex = triangle[index]
      const next = triangle[(index + 1) % triangle.length]
      // The lower and outer corners meet the intentionally sloped printable
      // underside, so they are not 90-degree edges and remain unchanged.
      if (index !== 1) {
        profile.push(vertex)
        continue
      }
      const previousLength = Math.hypot(previous[0] - vertex[0], previous[1] - vertex[1])
      const nextLength = Math.hypot(next[0] - vertex[0], next[1] - vertex[1])
      const distance = Math.min(treatment.sizeMm, previousLength * 0.3, nextLength * 0.3)
      const start: Point = [vertex[0] + (previous[0] - vertex[0]) * distance / previousLength, vertex[1] + (previous[1] - vertex[1]) * distance / previousLength]
      const end: Point = [vertex[0] + (next[0] - vertex[0]) * distance / nextLength, vertex[1] + (next[1] - vertex[1]) * distance / nextLength]
      for (let step = 0; step <= cornerSteps; step += 1) {
        const t = step / cornerSteps
        if (treatment.style === 'rounded') {
          const inverse = 1 - t
          profile.push([inverse * inverse * start[0] + 2 * inverse * t * vertex[0] + t * t * end[0], inverse * inverse * start[1] + 2 * inverse * t * vertex[1] + t * t * end[1]])
        } else profile.push(t === 0 ? start : end)
      }
    }
    const inset = insetConvexPolygon(profile, treatment.sizeMm)
    const axialSteps = treatment.style === 'rounded' ? 3 : 1
    const layers: Array<{ x: number; blend: number }> = []
    for (let step = 0; step <= axialSteps; step += 1) {
      const t = step / axialSteps
      layers.push({ x: -halfWidth + treatment.sizeMm * t, blend: treatment.style === 'rounded' ? Math.sin(t * Math.PI / 2) : t })
    }
    for (let step = 1; step <= axialSteps; step += 1) {
      const t = step / axialSteps
      layers.push({ x: halfWidth - treatment.sizeMm + treatment.sizeMm * t, blend: treatment.style === 'rounded' ? Math.cos(t * Math.PI / 2) : 1 - t })
    }
    const positions: number[] = []; const indices: number[] = []; const count = profile.length
    for (const layer of layers) for (let index = 0; index < count; index += 1) {
      const point: Point = [inset[index][0] + (profile[index][0] - inset[index][0]) * layer.blend, inset[index][1] + (profile[index][1] - inset[index][1]) * layer.blend]
      positions.push(layer.x, point[0], point[1])
    }
    for (let layer = 0; layer < layers.length - 1; layer += 1) connectLoops(indices, layer * count, (layer + 1) * count, count)
    for (let index = 1; index < count - 1; index += 1) indices.push(0, index + 1, index)
    const right = (layers.length - 1) * count
    for (let index = 1; index < count - 1; index += 1) indices.push(right, right + index, right + index + 1)
    return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
  }

  const positions = new Float32Array([
    -halfWidth, wallY, lowerZ,
    -halfWidth, wallY, topZ,
    -halfWidth, outerY, topZ,
    halfWidth, wallY, lowerZ,
    halfWidth, wallY, topZ,
    halfWidth, outerY, topZ,
  ])

  // The two end triangles and three rectangular faces are wound outwards.
  const indices = new Uint32Array([
    0, 2, 1,
    3, 4, 5,
    0, 3, 5, 0, 5, 2,
    1, 2, 5, 1, 5, 4,
    0, 1, 4, 0, 4, 3,
  ])

  return { positions, indices }
}

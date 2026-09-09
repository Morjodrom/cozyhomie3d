import type { DrawerParameters, DrawerTextureWalls, PotParameters, TextureConfig } from '../domain/design'
import { textureDisplacement, type SurfaceSample } from './textures'
import { clipPolygonToRect, strokePolygon, vectorTextureSegments, type Point } from './vector-textures'

export type RawMesh = {
  positions: Float32Array
  indices: Uint32Array
}

export type Tessellation = {
  circularSegments: number
  verticalSegments: number
  drawerSideSegments: number
}

export type VectorReliefOptions = { carrierSagittaMm: number; chordErrorMm: number }

export function potTexturePerimeter(parameters: PotParameters): number {
  const midpointRadius = (parameters.bottomDiameterMm + parameters.topDiameterMm) / 4
  return Math.PI * 2 * midpointRadius
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
  const ringCount = texture.kind === 'smooth' ? 2 : tessellation.verticalSegments + 1
  const segments = tessellation.circularSegments
  const positions: number[] = []
  const indices: number[] = []
  const bottomRadius = parameters.bottomDiameterMm / 2
  const topRadius = parameters.topDiameterMm / 2
  // Use one cylindrical texture domain for every height ring. Recomputing the
  // wrapped width from each tapered ring makes periodic features split as z changes.
  const texturePerimeterMm = potTexturePerimeter(parameters)

  for (let ring = 0; ring < ringCount; ring += 1) {
    const heightFraction = ring / (ringCount - 1)
    const z = parameters.heightMm * heightFraction
    const radius = bottomRadius + (topRadius - bottomRadius) * heightFraction

    for (let segment = 0; segment < segments; segment += 1) {
      const along = segment / segments
      const angle = along * Math.PI * 2
      const xMm = radius * Math.cos(angle)
      const yMm = radius * Math.sin(angle)
      const displacement = textureDisplacement(texture, { uMm: along * texturePerimeterMm, perimeterMm: texturePerimeterMm, zMm: z, heightMm: parameters.heightMm, xMm, yMm })
      const texturedRadius = radius + displacement
      positions.push(texturedRadius * Math.cos(angle), texturedRadius * Math.sin(angle), z)
    }
  }

  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    connectLoops(indices, ring * segments, (ring + 1) * segments, segments)
  }

  const bottomCenter = positions.length / 3
  positions.push(0, 0, 0)
  capLoop(indices, 0, segments, bottomCenter, false)

  const topCenter = positions.length / 3
  positions.push(0, 0, parameters.heightMm)
  capLoop(indices, (ringCount - 1) * segments, segments, topCenter, true)

  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

function polygonArea(points: Point[]): number {
  return points.reduce((area, point, i) => {
    const next = points[(i + 1) % points.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2
}

function coverageDepth(texture: Exclude<TextureConfig, { kind: 'smooth' }>, zMm: number, heightMm: number): number {
  const bandHeight = heightMm * texture.coveragePercent / 100
  const start = (heightMm - bandHeight) / 2; const end = start + bandHeight
  if (zMm < start || zMm > end) return 0
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

function textureZLevels(texture: Exclude<TextureConfig, { kind: 'smooth' }>, heightMm: number): number[] {
  const [start, end] = textureBand(texture, heightMm)
  const samples = texture.quality === 'low' ? 4 : texture.quality === 'medium' ? 6 : 8
  const levels = new Set<number>([start, end])
  const addFade = (from: number, to: number) => {
    if (to <= from) return
    for (let i = 1; i < samples; i += 1) levels.add(from + (to - from) * i / samples)
  }
  addFade(start, Math.min(end, start + texture.bottomFadeMm))
  addFade(Math.max(start, end - texture.topFadeMm), end)
  levels.add(Math.min(end, start + texture.bottomFadeMm))
  levels.add(Math.max(start, end - texture.topFadeMm))
  return [...levels].sort((a, b) => a - b)
}

/** Inserts exact fade breakpoints into a convex stroke without splitting it
 * into coplanar solids. The single watertight mesh avoids boolean seams at
 * adjacent fade slices while preserving the requested smoothstep profile. */
function splitPolygonEdgesAtZ(polygon: Point[], levels: number[]): Point[] {
  const result: Point[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    result.push(a)
    if (Math.abs(b[1] - a[1]) < 1e-9) continue
    const crossings = levels
      .filter((z) => z > Math.min(a[1], b[1]) + 1e-9 && z < Math.max(a[1], b[1]) - 1e-9)
      .sort((left, right) => a[1] < b[1] ? left - right : right - left)
    for (const z of crossings) {
      const t = (z - a[1]) / (b[1] - a[1])
      result.push([a[0] + (b[0] - a[0]) * t, z])
    }
  }
  return result
}

type SurfaceMapper = (uMm: number, zMm: number, displacementMm: number) => readonly [number, number, number]

/** A watertight convex polygon prism with a vertex-dependent (chamfer/fade) relief depth. */
function subdividePolygon(polygon: Point[], map: SurfaceMapper, errorMm: number): Point[] {
  const result: Point[] = []
  const walk = (a: Point, b: Point, depth: number): void => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const pa = map(a[0], a[1], 0); const pb = map(b[0], b[1], 0); const pm = map(mid[0], mid[1], 0)
    const chord: readonly [number, number, number] = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]
    if (depth < 12 && Math.hypot(pm[0] - chord[0], pm[1] - chord[1], pm[2] - chord[2]) > errorMm) { walk(a, mid, depth + 1); walk(mid, b, depth + 1); return }
    result.push(a)
  }
  for (let i = 0; i < polygon.length; i += 1) walk(polygon[i], polygon[(i + 1) % polygon.length], 0)
  return result
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

function surfacePolygonMesh(polygon: Point[], chamferMm: number, texture: Exclude<TextureConfig, { kind: 'smooth' }>, heightMm: number, map: SurfaceMapper, options: VectorReliefOptions): RawMesh | undefined {
  if (polygon.length < 3) return undefined
  const ordered = subdividePolygon(polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon, map, options.chordErrorMm)
  const plateau = insetConvexPolygon(ordered, chamferMm)
  const depths = plateau.map(([, z]) => coverageDepth(texture, z, heightMm))
  if (depths.every((depth) => Math.abs(depth) < 1e-7)) return undefined
  const positions: number[] = []; const indices: number[] = []; const n = ordered.length
  const overlap = options.carrierSagittaMm + options.chordErrorMm + .01
  const sign = texture.reliefMode === 'emboss' ? 1 : -1
  const ring = (points: Point[], displacement: (i: number) => number) => {
    for (let i = 0; i < n; i += 1) {
      const p = points[i]
      positions.push(...map(p[0], p[1], displacement(i)))
    }
  }
  // Base overlaps the carrier, middle follows its surface, and the 80% top
  // plateau is connected by an explicit chamfer instead of pixel shoulders.
  ring(ordered, () => -sign * overlap)
  ring(ordered, () => 0)
  ring(plateau, (i) => depths[i])
  for (let r = 0; r < 2; r += 1) for (let i = 0; i < n; i += 1) {
    const next = (i + 1) % n; const a = r * n + i; const b = r * n + next; const c = (r + 1) * n + next; const d = (r + 1) * n + i
    indices.push(a, b, c, a, c, d)
  }
  for (let i = 1; i < n - 1; i += 1) indices.push(2 * n, 2 * n + i, 2 * n + i + 1)
  for (let i = 1; i < n - 1; i += 1) indices.push(0, i + 1, i)
  // The solid extends in the opposite normal direction for a recess cutter.
  if (texture.reliefMode === 'recess') {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

function potMapper(parameters: PotParameters, perimeterMm: number, baseInsetMm: number): SurfaceMapper {
  const bottomRadius = parameters.bottomDiameterMm / 2; const topRadius = parameters.topDiameterMm / 2
  return (u, z, depth) => {
    const radius = bottomRadius + (topRadius - bottomRadius) * z / parameters.heightMm + depth + baseInsetMm
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
  const [minZ, maxZ] = textureBand(texture, parameters.heightMm)
  const zLevels = textureZLevels(texture, parameters.heightMm)
  for (const segment of vectorTextureSegments(texture, perimeter, parameters.heightMm)) {
    const stroke = strokePolygon(segment)
    const polygon = splitPolygonEdgesAtZ(clipPolygonToRect(stroke, 0, perimeter, minZ, maxZ), zLevels)
    const mesh = surfacePolygonMesh(polygon, segment.widthMm * 0.1, texture, parameters.heightMm, mapper, options)
    if (mesh) result.push(mesh)
  }
  return result
}

type RectanglePoint = {
  point: Point2
  outward: Point2
  alongSide: number
  uMm: number
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
  if (item.outward[1] === -1) return Number(textureWalls.front)
  if (item.outward[1] === 1) return Number(textureWalls.back)
  return Number(textureWalls.sides)
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
  const walls: Array<{ min: number; max: number; enabled: boolean }> = [
    { min: 0, max: parameters.depthMm, enabled: textureWalls.sides },
    { min: parameters.depthMm, max: parameters.depthMm + parameters.widthMm, enabled: textureWalls.back },
    { min: parameters.depthMm + parameters.widthMm, max: parameters.depthMm * 2 + parameters.widthMm, enabled: textureWalls.sides },
    { min: parameters.depthMm * 2 + parameters.widthMm, max: perimeter, enabled: textureWalls.front },
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
  const [bandMinZ, bandMaxZ] = textureBand(texture, parameters.heightMm)
  const zLevels = textureZLevels(texture, parameters.heightMm)
  for (const segment of vectorTextureSegments(texture, perimeter, parameters.heightMm)) {
    const stroke = strokePolygon(segment)
    for (const wall of walls) {
      if (!wall.enabled) continue
      const regions = wall.min !== frontStart
        ? [[wall.min, wall.max, bandMinZ, bandMaxZ] as const]
        : [
          [wall.min, Math.min(wall.max, handleMinU), bandMinZ, bandMaxZ] as const,
          [Math.max(wall.min, handleMaxU), wall.max, bandMinZ, bandMaxZ] as const,
          [Math.max(wall.min, handleMinU), Math.min(wall.max, handleMaxU), bandMinZ, Math.min(bandMaxZ, handleMinZ)] as const,
          [Math.max(wall.min, handleMinU), Math.min(wall.max, handleMaxU), Math.max(bandMinZ, handleMaxZ), bandMaxZ] as const,
        ]
      for (const region of regions) {
        if (region[1] <= region[0] || region[3] <= region[2]) continue
        const polygon = splitPolygonEdgesAtZ(clipPolygonToRect(stroke, ...region), zLevels)
        const mesh = surfacePolygonMesh(polygon, segment.widthMm * 0.1, texture, parameters.heightMm, mapper, options)
        if (mesh) result.push(mesh)
      }
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
  const ringCount = texture.kind === 'smooth' || !hasTexturedWall ? 2 : tessellation.verticalSegments + 1
  const loop = rectangleLoop(parameters.widthMm, parameters.depthMm, tessellation.drawerSideSegments)
  const loopSize = loop.length
  const positions: number[] = []
  const indices: number[] = []
  const perimeterMm = 2 * (parameters.widthMm + parameters.depthMm)

  for (let ring = 0; ring < ringCount; ring += 1) {
    const heightFraction = ring / (ringCount - 1)
    const z = parameters.heightMm * heightFraction
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

  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    connectLoops(indices, ring * loopSize, (ring + 1) * loopSize, loopSize)
  }

  const bottomCenter = positions.length / 3
  positions.push(0, 0, 0)
  capLoop(indices, 0, loopSize, bottomCenter, false)

  const topCenter = positions.length / 3
  positions.push(0, 0, parameters.heightMm)
  capLoop(indices, (ringCount - 1) * loopSize, loopSize, topCenter, true)

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

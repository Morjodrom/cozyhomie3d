import type { DrawerParameters, DrawerTextureWalls, PotParameters, TextureConfig } from '../domain/design'
import { textureDisplacement, type SurfaceSample } from './textures'

export type RawMesh = {
  positions: Float32Array
  indices: Uint32Array
}

export type Tessellation = {
  circularSegments: number
  verticalSegments: number
  drawerSideSegments: number
}

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
      const displacement = textureDisplacement(texture, sample) * structuralMask
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

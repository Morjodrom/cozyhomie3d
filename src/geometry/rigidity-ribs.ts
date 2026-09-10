import type { DrawerParameters, PotParameters } from '../domain/design'
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import type { RawMesh } from './mesh-builders'

const ROOT_EMBED_MM = 0.25

/** Lower-biased elevations retain a generous rim keepout while concentrating hoops near the loaded floor. */
export function lowerBiasedHoopElevations(heightMm: number, gussetMm: number, baseWidthMm: number, count: number, floorMm = 0): number[] {
  if (count <= 0) return []
  const low = floorMm + gussetMm + baseWidthMm + 0.6
  const high = heightMm - baseWidthMm / 2
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / (count + 1)
    return low + (high - low) * t * t
  })
}

export function rigidityRibCenterlines(sizeMm: number, count: number): number[] {
  if (count <= 0) return []
  const spacing = sizeMm / (count + 1)
  return Array.from({ length: count }, (_, index) => -sizeMm / 2 + spacing * (index + 1))
}

function rawFromLoops(lower: Array<[number, number, number]>, upper: Array<[number, number, number]>): RawMesh {
  const positions = new Float32Array([...lower, ...upper].flat())
  const count = lower.length
  const indices: number[] = []
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index + 1, index)
    indices.push(count, count + index, count + index + 1)
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count
    indices.push(index, next, count + next, index, count + next, count + index)
  }
  return { positions, indices: new Uint32Array(indices) }
}

function triangleLoop(center: number, baseWidthMm: number, root: number, apex: number, frontBack: boolean, zMm: number): Array<[number, number, number]> {
  const half = baseWidthMm / 2
  const loop: Array<[number, number, number]> = frontBack
    ? [[center - half, root, zMm], [center + half, root, zMm], [center, apex, zMm]]
    : [[root, center - half, zMm], [apex, center, zMm], [root, center + half, zMm]]
  // CrossSection/mesh booleans require counter-clockwise horizontal loops on both sides.
  const signedArea = loop.reduce((area, point, index) => {
    const next = loop[(index + 1) % loop.length]
    return area + point[0] * next[1] - next[0] * point[1]
  }, 0)
  if (signedArea < 0) [loop[1], loop[2]] = [loop[2], loop[1]]
  return loop
}

function verticalRib(center: number, baseWidthMm: number, root: number, fullApex: number, topApex: number, frontBack: boolean, floorMm: number, heightMm: number): RawMesh {
  const lower = triangleLoop(center, baseWidthMm, root, fullApex, frontBack, floorMm)
  const upper = triangleLoop(center, baseWidthMm, root, topApex, frontBack, heightMm)
  return rawFromLoops(lower, upper)
}

function wallGusset(lengthMm: number, root: number, floorApex: number, floorMm: number, topMm: number, frontBack: boolean): RawMesh {
  const half = lengthMm / 2
  return frontBack
    ? rawFromLoops([[-half, root, floorMm], [-half, floorApex, floorMm], [-half, root, topMm]], [[half, root, floorMm], [half, floorApex, floorMm], [half, root, topMm]])
    : rawFromLoops([[root, -half, floorMm], [floorApex, -half, floorMm], [root, -half, topMm]], [[root, half, floorMm], [floorApex, half, floorMm], [root, half, topMm]])
}

/** Additive tapered vertical ribs and a continuous wall-to-floor gusset. */
export function buildDrawerRigidityRibMeshes(parameters: DrawerParameters): RawMesh[] {
  const ribs = parameters.rigidityRibs
  if (!ribs.enabled) return []
  const inside = ribs.placement === 'inside'
  const halfWidth = parameters.widthMm / 2
  const halfDepth = parameters.depthMm / 2
  const embed = ROOT_EMBED_MM
  const floorMm = inside ? parameters.bottomThicknessMm : 0
  const result: RawMesh[] = []
  const addFrontBack = (y: number, direction: number, count: number) => {
    const root = y - direction * embed
    const fullApex = y + direction * ribs.projectionMm
    const topApex = y + direction * ribs.projectionMm * 0.25
    for (const center of rigidityRibCenterlines(parameters.widthMm - 2 * parameters.wallThicknessMm, count)) {
      result.push(verticalRib(center, ribs.baseWidthMm, root, fullApex, topApex, true, floorMm, parameters.heightMm))
    }
    result.push(wallGusset(parameters.widthMm, root, y + direction * ribs.wallBottomGussetMm, floorMm, floorMm + ribs.wallBottomGussetMm, true))
  }
  const addSides = (x: number, direction: number, count: number) => {
    const root = x - direction * embed
    const fullApex = x + direction * ribs.projectionMm
    const topApex = x + direction * ribs.projectionMm * 0.25
    for (const center of rigidityRibCenterlines(parameters.depthMm - 2 * parameters.wallThicknessMm, count)) result.push(verticalRib(center, ribs.baseWidthMm, root, fullApex, topApex, false, floorMm, parameters.heightMm))
    result.push(wallGusset(parameters.depthMm, root, x + direction * ribs.wallBottomGussetMm, floorMm, floorMm + ribs.wallBottomGussetMm, false))
  }
  const front = inside ? -halfDepth + parameters.wallThicknessMm : -halfDepth
  const back = inside ? halfDepth - parameters.wallThicknessMm : halfDepth
  const left = inside ? -halfWidth + parameters.wallThicknessMm : -halfWidth
  const right = inside ? halfWidth - parameters.wallThicknessMm : halfWidth
  const frontDirection = inside ? 1 : -1
  const backDirection = -frontDirection
  const leftDirection = inside ? 1 : -1
  const rightDirection = -leftDirection
  addFrontBack(front, frontDirection, ribs.frontBackCount)
  addFrontBack(back, backDirection, ribs.frontBackCount)
  addSides(left, leftDirection, ribs.sideCount)
  addSides(right, rightDirection, ribs.sideCount)
  return result
}

function revolveProfile(module: ManifoldToplevel, profilePoints: Array<[number, number]>, segments: number): Manifold {
  const profile = new module.CrossSection([profilePoints])
  try { return profile.revolve(segments) } finally { profile.delete() }
}

/** Annular hoop ribs and a continuous annular wall-to-floor gusset for tapered pots. */
export function buildPotRigidityRibs(module: ManifoldToplevel, parameters: PotParameters, circularSegments: number): Manifold[] {
  const ribs = parameters.rigidityRibs
  if (!ribs.enabled) return []
  const slope = (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm
  const wallAt = (z: number) => parameters.bottomDiameterMm / 2 + slope * z + (ribs.placement === 'inside' ? -parameters.wallThicknessMm : 0)
  const direction = ribs.placement === 'inside' ? -1 : 1
  const result: Manifold[] = []
  const rootAt = (z: number) => wallAt(z) - direction * ROOT_EMBED_MM
  const floorMm = ribs.placement === 'inside' ? parameters.bottomThicknessMm : 0
  for (const z of lowerBiasedHoopElevations(parameters.heightMm, ribs.wallBottomGussetMm, ribs.baseWidthMm, ribs.count, floorMm)) {
    const half = ribs.baseWidthMm / 2
    const rootLow = rootAt(z - half); const rootHigh = rootAt(z + half)
    const apex = wallAt(z) + direction * ribs.projectionMm
    result.push(revolveProfile(module, direction < 0
      ? [[rootLow, z - half], [rootHigh, z + half], [apex, z]]
      : [[rootLow, z - half], [apex, z], [rootHigh, z + half]], circularSegments))
  }
  const rootBottom = rootAt(floorMm); const rootTop = rootAt(floorMm + ribs.wallBottomGussetMm)
  const floorApex = wallAt(floorMm) + direction * ribs.wallBottomGussetMm
  result.push(revolveProfile(module, direction < 0
    ? [[rootBottom, floorMm], [rootTop, floorMm + ribs.wallBottomGussetMm], [floorApex, floorMm]]
    : [[rootBottom, floorMm], [floorApex, floorMm], [rootTop, floorMm + ribs.wallBottomGussetMm]], circularSegments))
  return result
}

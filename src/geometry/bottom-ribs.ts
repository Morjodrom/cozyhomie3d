import type { BuildQuality } from '../domain/worker'
import type { DrawerParameters, PotParameters } from '../domain/design'
import type { Manifold, ManifoldToplevel } from 'manifold-3d'

const CUTTER_OVERCUT_MM = 0.2
const ROUNDING_RATIO = 0.15
const CURVE_SEGMENTS: Record<BuildQuality, number> = { draft: 3, preview: 5, export: 8 }

/** Returns count interior positions separated from both edges by the same centerline spacing. */
export function evenlySpacedCenterlines(sizeMm: number, count: number): number[] {
  if (count <= 0) return []
  const spacing = sizeMm / (count + 1)
  return Array.from({ length: count }, (_, index) => -sizeMm / 2 + spacing * (index + 1))
}

/** Returns concentric centerline radii with equal radial gaps from the center and outer edge. */
export function concentricRibRadii(radiusMm: number, count: number): number[] {
  if (count <= 0) return []
  const spacing = radiusMm / (count + 1)
  return Array.from({ length: count }, (_, index) => spacing * (index + 1))
}

/**
 * A V profile with straight flanks and eased shoulders/root. The generated
 * polygon retains the exact requested opening width and maximum depth.
 */
export function roundedVProfile(widthMm: number, depthMm: number, curveSegments: number): Array<[number, number]> {
  const halfWidth = widthMm / 2
  const roundingMm = ROUNDING_RATIO * Math.min(depthMm, halfWidth)
  const transition = Math.min(0.24, roundingMm / halfWidth)
  const segments = Math.max(1, Math.floor(curveSegments))

  const normalizedDepth = (t: number): number => {
    let raw: number
    if (t < transition) raw = t * t / (2 * transition)
    else if (t <= 1 - transition) raw = t - transition / 2
    else raw = 1 - transition - (1 - t) * (1 - t) / (2 * transition)
    return raw / (1 - transition)
  }

  const samples = new Set<number>([0, transition, 1 - transition, 1])
  for (let step = 1; step < segments; step += 1) {
    samples.add(transition * step / segments)
    samples.add(1 - transition + transition * step / segments)
  }
  const inward = [...samples].sort((a, b) => a - b)
  const rightToRoot = inward.map((t): [number, number] => [halfWidth * (1 - t), depthMm * normalizedDepth(t)])
  const rootToLeft = inward.slice(0, -1).reverse().map((t): [number, number] => [-halfWidth * (1 - t), depthMm * normalizedDepth(t)])

  return [
    [-halfWidth, -CUTTER_OVERCUT_MM],
    [halfWidth, -CUTTER_OVERCUT_MM],
    ...rightToRoot,
    ...rootToLeft,
  ]
}

function translateAndDelete(source: Manifold, x: number, y: number, z: number): Manifold {
  try {
    return source.translate(x, y, z)
  } finally {
    source.delete()
  }
}

function rotateAndDelete(source: Manifold, x: number, y: number, z: number): Manifold {
  try {
    return source.rotate(x, y, z)
  } finally {
    source.delete()
  }
}

function grooveAlongY(
  module: ManifoldToplevel,
  widthMm: number,
  depthMm: number,
  lengthMm: number,
  centerX: number,
  curveSegments: number,
): Manifold {
  const profile = new module.CrossSection([roundedVProfile(widthMm, depthMm, curveSegments)])
  let extrusion: Manifold
  try {
    extrusion = profile.extrude(lengthMm + 2 * CUTTER_OVERCUT_MM)
  } finally {
    profile.delete()
  }
  const oriented = rotateAndDelete(extrusion, 90, 0, 0)
  return translateAndDelete(oriented, centerX, lengthMm / 2 + CUTTER_OVERCUT_MM, 0)
}

export function buildDrawerBottomRibCutters(
  module: ManifoldToplevel,
  parameters: DrawerParameters,
  quality: BuildQuality,
): Manifold[] {
  const ribs = parameters.bottomRibs
  if (!ribs.enabled) return []
  const curveSegments = CURVE_SEGMENTS[quality]
  const cutters: Manifold[] = []

  try {
    for (const y of evenlySpacedCenterlines(parameters.depthMm, ribs.xCount)) {
      const alongY = grooveAlongY(module, ribs.widthMm, ribs.depthMm, parameters.widthMm, 0, curveSegments)
      cutters.push(translateAndDelete(rotateAndDelete(alongY, 0, 0, 90), 0, y, 0))
    }
    for (const x of evenlySpacedCenterlines(parameters.widthMm, ribs.yCount)) {
      cutters.push(grooveAlongY(module, ribs.widthMm, ribs.depthMm, parameters.depthMm, x, curveSegments))
    }
    return cutters
  } catch (error) {
    for (const cutter of cutters) cutter.delete()
    throw error
  }
}

export function buildPotBottomRibCutters(
  module: ManifoldToplevel,
  parameters: PotParameters,
  quality: BuildQuality,
  circularSegments: number,
  availableRadiusMm = parameters.bottomDiameterMm / 2,
): Manifold[] {
  const ribs = parameters.bottomRibs
  if (!ribs.enabled) return []
  const curveSegments = CURVE_SEGMENTS[quality]
  const cutters: Manifold[] = []

  try {
    for (const radius of concentricRibRadii(availableRadiusMm, ribs.count)) {
      const localProfile = roundedVProfile(ribs.widthMm, ribs.depthMm, curveSegments)
      const ringProfile = localProfile.map(([offset, z]): [number, number] => [radius + offset, z])
      const profile = new module.CrossSection([ringProfile])
      try {
        cutters.push(module.Manifold.revolve(profile, circularSegments))
      } finally {
        profile.delete()
      }
    }
    return cutters
  } catch (error) {
    for (const cutter of cutters) cutter.delete()
    throw error
  }
}

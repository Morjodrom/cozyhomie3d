import type { DesignConfig, DrawerParameters, PotParameters, TextureConfig } from '../domain/design'
import { designConfigSchema, FRACTAL_BRANCH_LENGTH_RATIO, FRACTAL_BRANCH_WIDTH_RATIO, trayConnectorDimensions } from '../domain/design'
import { cavityFloorRadius, resolveDrainageHoles } from '../domain/drainage'
import type { BuildQuality, MeshData, ModelPartData, ModelPartKind, ModelStats } from '../domain/worker'
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { getManifoldModule } from './manifold'
import { buildDrawerBottomRibCutters, buildPotBottomRibCutters } from './bottom-ribs'
import { buildDrawerRigidityRibMeshes, buildPotRigidityRibs } from './rigidity-ribs'
import {
  buildDrawerHandleMesh,
  buildDrawerCavityMesh,
  buildDrawerOuterMesh,
  buildDrawerVectorTextureMeshes,
  buildPotOuterMesh,
  buildPotVectorTextureMeshes,
  drawerHandleBounds,
  potTexturePerimeter,
  resolveAxialEdgeTreatment,
  type AxialEdgeTreatment,
  type RawMesh,
  type Tessellation,
} from './mesh-builders'
import { fractalTextureDensityReduced } from './vector-textures'

const MAX_TRIANGLES = 500_000

export type GeometryResult = {
  parts: ModelPartData[]
  stats: ModelStats
  warnings: string[]
}

const BASE_TESSELLATION: Record<BuildQuality, Tessellation> = {
  draft: { circularSegments: 48, verticalSegments: 10, drawerSideSegments: 24, edgeSegments: 3 },
  preview: { circularSegments: 72, verticalSegments: 16, drawerSideSegments: 36, edgeSegments: 5 },
  export: { circularSegments: 108, verticalSegments: 26, drawerSideSegments: 54, edgeSegments: 8 },
}

const TEXTURE_SAMPLES: Record<'low' | 'medium' | 'high', number> = {
  low: 4,
  medium: 6,
  high: 8,
}
const BUILD_SAMPLES: Record<BuildQuality, number> = { draft: 0.65, preview: 1, export: 1.35 }
const RAW_TRIANGLE_BUDGET: Record<BuildQuality, number> = { draft: 35_000, preview: 100_000, export: 240_000 }
const TEXTURE_TOLERANCE_MM: Record<'low' | 'medium' | 'high', number> = { low: 0.2, medium: 0.1, high: 0.05 }
const BUILD_TOLERANCE_FACTOR: Record<BuildQuality, number> = { draft: 1.5, preview: 1, export: 0.75 }

export type TessellationPlan = { tessellation: Tessellation; warnings: string[] }

function textureToleranceMm(texture: TextureConfig, quality: BuildQuality): number {
  if (texture.kind === 'smooth') return Number.POSITIVE_INFINITY
  return TEXTURE_TOLERANCE_MM[texture.quality] * BUILD_TOLERANCE_FACTOR[quality]
}

function textureFeatureScale(texture: TextureConfig): number {
  if (texture.kind === 'smooth') return Number.POSITIVE_INFINITY
  if (texture.kind === 'noise') return texture.scaleMm / 2 ** (texture.octaves - 1)
  if (texture.kind === 'honeycomb') return Math.min(texture.scaleMm, texture.spacingMm)
  if (texture.kind === 'voronoi') return Math.min(texture.scaleMm, texture.edgeWidthMm)
  if (texture.kind === 'fractal') return Math.min(
    texture.scaleMm * FRACTAL_BRANCH_LENGTH_RATIO ** (texture.levels - 1),
    texture.branchWidthMm * FRACTAL_BRANCH_WIDTH_RATIO ** (texture.levels - 1),
  )
  return texture.scaleMm
}

function fractalSurfaceDimensions(config: DesignConfig): readonly [number, number] {
  if (config.type === 'drawer') {
    return [2 * (config.parameters.widthMm + config.parameters.depthMm), config.parameters.heightMm]
  }
  if (config.type === 'pot') return [potTexturePerimeter(config.parameters), config.parameters.heightMm]
  const connector = trayConnectorDimensions(config.parameters, config.tray)
  const combined: PotParameters = {
    ...config.parameters,
    heightMm: config.parameters.heightMm + config.tray.heightMm,
    bottomDiameterMm: connector.trayBottomRadiusMm * 2,
  }
  return [potTexturePerimeter(combined), combined.heightMm]
}

function clampGrid(horizontal: number, vertical: number, budget: number): readonly [number, number, boolean] {
  const current = horizontal * vertical * 2
  if (current <= budget) return [horizontal, vertical, false]
  const factor = Math.sqrt(budget / current)
  return [Math.max(3, Math.floor(horizontal * factor)), Math.max(2, Math.floor(vertical * factor)), true]
}

/**
 * Selects a feature-aware surface grid. Preview deliberately uses fewer samples
 * than export; the raw grid is budgeted before boolean operations so final output
 * stays comfortably under the hard 500k triangle limit.
 */
export function planTessellation(config: DesignConfig, quality: BuildQuality): TessellationPlan {
  const base = { ...BASE_TESSELLATION[quality] }
  const texture = config.texture
  if (texture.kind === 'smooth') return { tessellation: base, warnings: [] }
  if (config.type === 'drawer' && !Object.values(config.textureWalls).some(Boolean)) {
    return { tessellation: base, warnings: [] }
  }

  // Geometric presets are contour-defined.  Their straightness is independent
  // of a UV grid; only the carrier's circular chord error needs tessellation.
  if (texture.kind !== 'noise') {
    const [perimeterMm, heightMm] = fractalSurfaceDimensions(config)
    const warnings = fractalTextureDensityReduced(texture, perimeterMm, heightMm)
      ? ['Fractal branch density was reduced to keep the mesh below the export complexity limit.']
      : []
    if (config.type === 'drawer') return { tessellation: base, warnings }
    const trayBottomDiameter = config.type === 'pot-with-tray'
      ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
      : 0
    const radius = Math.max(config.parameters.bottomDiameterMm, config.parameters.topDiameterMm, trayBottomDiameter) / 2
    const tolerance = Math.min(radius, textureToleranceMm(texture, quality))
    const circularSegments = Math.max(
      base.circularSegments,
      Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / radius))),
    )
    return { tessellation: { ...base, circularSegments }, warnings }
  }

  const samples = TEXTURE_SAMPLES[texture.quality] * BUILD_SAMPLES[quality]
  const featureScale = textureFeatureScale(texture)
  const height = config.parameters.heightMm + (config.type === 'pot-with-tray' ? config.tray.heightMm : 0)
  const vertical = Math.max(base.verticalSegments, Math.ceil(height / featureScale * samples))
  const warnings: string[] = []

  if (config.type !== 'drawer') {
    const trayBottomDiameter = config.type === 'pot-with-tray'
      ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
      : 0
    const perimeter = Math.PI * Math.max(config.parameters.bottomDiameterMm, config.parameters.topDiameterMm, trayBottomDiameter)
    let horizontal = Math.max(base.circularSegments, Math.ceil(perimeter / featureScale * samples))
    const [circularSegments, verticalSegments, clamped] = clampGrid(horizontal, vertical, RAW_TRIANGLE_BUDGET[quality])
    if (clamped) warnings.push('Texture sampling was reduced to keep the mesh below the export complexity limit.')
    return { tessellation: { ...base, circularSegments, verticalSegments }, warnings }
  }

  const parameters: DrawerParameters = config.parameters
  const perSide = Math.max(base.drawerSideSegments, Math.ceil(Math.max(parameters.widthMm, parameters.depthMm) / featureScale * samples))
  const [horizontal, verticalSegments, clamped] = clampGrid(perSide * 4, vertical, RAW_TRIANGLE_BUDGET[quality])
  if (clamped) warnings.push('Texture sampling was reduced to keep the mesh below the export complexity limit.')
  return { tessellation: { ...base, drawerSideSegments: Math.max(3, Math.floor(horizontal / 4)), verticalSegments }, warnings }
}

function manifoldFromRaw(module: ManifoldToplevel, raw: RawMesh): Manifold {
  const mesh = new module.Mesh({ numProp: 3, vertProperties: raw.positions, triVerts: raw.indices })
  const manifold = module.Manifold.ofMesh(mesh)
  const status = manifold.status()
  if (status !== 'NoError') {
    manifold.delete()
    throw new Error(`Generated surface is not manifold (${status}).`)
  }
  return manifold
}

function vectorOptions(config: DesignConfig, quality: BuildQuality, tessellation: Tessellation): { carrierSagittaMm: number; chordErrorMm: number } {
  const chordErrorMm = textureToleranceMm(config.texture, quality)
  if (config.type === 'drawer') return { carrierSagittaMm: 0, chordErrorMm }
  const trayBottomDiameter = config.type === 'pot-with-tray'
    ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
    : 0
  const radius = Math.max(config.parameters.bottomDiameterMm, config.parameters.topDiameterMm, trayBottomDiameter) / 2
  return { carrierSagittaMm: radius * (1 - Math.cos(Math.PI / tessellation.circularSegments)), chordErrorMm }
}

function evaluateAndDisposeInputs(result: Manifold, inputs: Manifold[]): Manifold {
  let status
  try {
    status = result.status()
  } catch (error) {
    result.delete()
    throw error
  } finally {
    for (const input of inputs) input.delete()
  }
  if (status !== 'NoError') {
    result.delete()
    throw new Error(`Geometry operation failed (${status}).`)
  }
  return result
}

/**
 * Large vector boolean batches can leave zero-volume numerical shells at
 * coincident stroke joins.  They are not printable components; retain the one
 * physical solid while still allowing validateSingleSolid() to reject any
 * genuinely disconnected volume.
 */
function discardNumericalShells(manifold: Manifold): Manifold {
  const components = manifold.decompose()
  // The minimum legal texture can create roughly 0.036 mm³ of material, so
  // this remains safely below any intentional printable feature.
  // A disconnected printable component has positive oriented volume. Tiny or
  // negative shells are cancellation debris produced at coincident coplanar
  // joins, not material that should survive to the exported solid.
  const physical = components.filter((component) => component.volume() > 0.005)
  if (physical.length !== 1 || components.length === 1) {
    for (const component of components) component.delete()
    return manifold
  }
  const result = physical[0]
  for (const component of components) if (component !== result) component.delete()
  manifold.delete()
  return result
}

/**
 * Vector textures are built as separate cutter/additive meshes. At a handful
 * of parameter combinations, boolean round-off can leave small positive-volume
 * texture islands next to the otherwise valid pot shell. They must not make
 * the complete printable body fail validation or appear as floating STL parts.
 */
function discardDetachedSurfaceFragments(manifold: Manifold, warnings: string[]): Manifold {
  const components = manifold.decompose()
  if (components.length <= 1) {
    for (const component of components) component.delete()
    return manifold
  }

  const ranked = components
    .map((component) => ({ component, volume: Math.max(0, component.volume()) }))
    .sort((a, b) => b.volume - a.volume)
  const totalVolume = ranked.reduce((sum, entry) => sum + entry.volume, 0)
  const dominant = ranked[0]

  // Only repair a clearly dominant body. Comparable components indicate a
  // genuine structural disconnection and must still fail the strict validator.
  if (!dominant || dominant.volume <= 0 || dominant.volume / totalVolume < 0.9) {
    for (const entry of ranked) entry.component.delete()
    return manifold
  }

  for (const entry of ranked.slice(1)) entry.component.delete()
  manifold.delete()
  if (!warnings.includes('Detached surface fragments were omitted to keep the model printable.')) {
    warnings.push('Detached surface fragments were omitted to keep the model printable.')
  }
  return dominant.component
}

function translateAndDeleteSource(source: Manifold, x: number, y: number, z: number): Manifold {
  try {
    const translated = source.translate(x, y, z)
    const status = translated.status()
    if (status !== 'NoError') {
      translated.delete()
      throw new Error(`Geometry transform failed (${status}).`)
    }
    return translated
  } finally {
    source.delete()
  }
}

/** Counter-clockwise rounded rectangle in the XY plane, centered at the origin. */
export function roundedRectangleContour(widthMm: number, heightMm: number, radiusMm: number, segmentsPerCorner: number): Array<[number, number]> {
  const halfWidth = widthMm / 2
  const halfHeight = heightMm / 2
  if (radiusMm <= 0) {
    return [
      [-halfWidth, -halfHeight],
      [halfWidth, -halfHeight],
      [halfWidth, halfHeight],
      [-halfWidth, halfHeight],
    ]
  }

  const radius = Math.min(radiusMm, halfWidth, halfHeight)
  const segments = Math.max(1, Math.floor(segmentsPerCorner))
  const corners = [
    { x: halfWidth - radius, y: halfHeight - radius, start: 0 },
    { x: -halfWidth + radius, y: halfHeight - radius, start: Math.PI / 2 },
    { x: -halfWidth + radius, y: -halfHeight + radius, start: Math.PI },
    { x: halfWidth - radius, y: -halfHeight + radius, start: Math.PI * 1.5 },
  ]
  const points: Array<[number, number]> = []
  for (const corner of corners) {
    for (let step = 0; step < segments; step += 1) {
      const angle = corner.start + step / segments * Math.PI / 2
      points.push([corner.x + radius * Math.cos(angle), corner.y + radius * Math.sin(angle)])
    }
  }
  return points
}

function orientExtrusionAlongY(source: Manifold, endY: number, centerZ: number): Manifold {
  let rotated: Manifold
  try {
    rotated = source.rotate(90, 0, 0)
  } finally {
    source.delete()
  }
  return translateAndDeleteSource(rotated, 0, endY, centerZ)
}

function roundedRectanglePrismAlongY(
  module: ManifoldToplevel,
  widthMm: number,
  heightMm: number,
  radiusMm: number,
  startY: number,
  endY: number,
  centerZ: number,
  segmentsPerCorner: number,
): Manifold {
  const profile = new module.CrossSection([roundedRectangleContour(widthMm, heightMm, radiusMm, segmentsPerCorner)])
  try {
    return orientExtrusionAlongY(profile.extrude(endY - startY), endY, centerZ)
  } finally {
    profile.delete()
  }
}

function roundedRectangleFrameAlongY(
  module: ManifoldToplevel,
  openingWidthMm: number,
  openingHeightMm: number,
  openingRadiusMm: number,
  frameWidthMm: number,
  startY: number,
  endY: number,
  centerZ: number,
  segmentsPerCorner: number,
): Manifold {
  const inner = new module.CrossSection([roundedRectangleContour(openingWidthMm, openingHeightMm, openingRadiusMm, segmentsPerCorner)])
  const outer = new module.CrossSection([roundedRectangleContour(
    openingWidthMm + 2 * frameWidthMm,
    openingHeightMm + 2 * frameWidthMm,
    openingRadiusMm + frameWidthMm,
    segmentsPerCorner,
  )])
  let frame
  try {
    frame = outer.subtract(inner)
  } finally {
    outer.delete()
    inner.delete()
  }
  try {
    return orientExtrusionAlongY(frame.extrude(endY - startY), endY, centerZ)
  } finally {
    frame.delete()
  }
}

function revolvedProfile(module: ManifoldToplevel, points: Array<[number, number]>, segments: number): Manifold {
  const profile = new module.CrossSection([points])
  try {
    return profile.revolve(segments)
  } finally {
    profile.delete()
  }
}

function roundedRadialTransition(radiusMm: number, zMm: number, sizeMm: number, outward: boolean, segments: number, rising: boolean): Array<[number, number]> {
  const points: Array<[number, number]> = []
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const angle = t * Math.PI / 2
    const dz = sizeMm * (1 - Math.cos(angle))
    const dr = sizeMm * (1 - Math.sin(angle))
    points.push([radiusMm + (outward ? dr : -dr), zMm + (rising ? dz : -dz)])
  }
  return points
}

function validateSingleSolid(manifold: Manifold): void {
  if (manifold.isEmpty() || manifold.volume() <= 0) {
    throw new Error('Generated model is empty.')
  }

  const components = manifold.decompose()
  const componentCount = components.length
  for (const component of components) component.delete()
  if (componentCount !== 1) {
    throw new Error('Generated model contains disconnected parts.')
  }
}

function buildTexturedPotOuter(
  module: ManifoldToplevel,
  parameters: PotParameters,
  texture: TextureConfig,
  tessellation: Tessellation,
  quality: BuildQuality,
  warnings: string[],
  axialTreatment?: AxialEdgeTreatment,
): Manifold {
  const vector = texture.kind !== 'smooth' && texture.kind !== 'noise' ? texture : undefined
  const shellTexture = vector ? { kind: 'smooth' as const } : texture
  let shell = manifoldFromRaw(module, buildPotOuterMesh(parameters, shellTexture, tessellation, axialTreatment))
  if (!vector) return shell

  const radius = Math.max(parameters.bottomDiameterMm, parameters.topDiameterMm) / 2
  const options = {
    carrierSagittaMm: radius * (1 - Math.cos(Math.PI / tessellation.circularSegments)),
    chordErrorMm: textureToleranceMm(texture, quality),
  }
  const parts = buildPotVectorTextureMeshes(parameters, vector, options, axialTreatment).map((raw) => manifoldFromRaw(module, raw))
  if (!parts.length) return shell
  const result = vector.reliefMode === 'emboss'
    ? module.Manifold.union([shell, ...parts])
    : module.Manifold.difference([shell, ...parts])
  shell = discardDetachedSurfaceFragments(
    discardNumericalShells(evaluateAndDisposeInputs(result, [shell, ...parts])),
    warnings,
  )
  return shell
}

function annularPrism(module: ManifoldToplevel, innerRadiusMm: number, outerRadiusMm: number, bottomZMm: number, topZMm: number, segments: number): Manifold {
  return revolvedProfile(module, [
    [innerRadiusMm, bottomZMm],
    [outerRadiusMm, bottomZMm],
    [outerRadiusMm, topZMm],
    [innerRadiusMm, topZMm],
  ], segments)
}

function clipByZ(module: ManifoldToplevel, source: Manifold, bottomZMm: number, heightMm: number): Manifold {
  const bounds = source.boundingBox()
  const span = Math.max(
    Math.abs(bounds.min[0]), Math.abs(bounds.max[0]),
    Math.abs(bounds.min[1]), Math.abs(bounds.max[1]),
  ) * 2 + 4
  const clip = translateAndDeleteSource(module.Manifold.cube([span, span, heightMm], true), 0, 0, bottomZMm + heightMm / 2)
  return discardNumericalShells(evaluateAndDisposeInputs(source.intersect(clip), [clip]))
}

function finishPot(
  module: ManifoldToplevel,
  parameters: PotParameters,
  outer: Manifold,
  tessellation: Tessellation,
  quality: BuildQuality,
  bottomRibRadiusMm = parameters.bottomDiameterMm / 2,
  connectorGroove?: { innerRadiusMm: number; outerRadiusMm: number; depthMm: number },
): Manifold {
  const bottomRadius = parameters.bottomDiameterMm / 2
  const topRadius = parameters.topDiameterMm / 2
  const radiusSlope = (topRadius - bottomRadius) / parameters.heightMm
  const cavityBottomRadius = cavityFloorRadius(parameters)
  const overcutMm = 1
  // Extrapolate with the same slope through the overcut. Using the rim radius
  // directly as the cutter's high radius changes the taper and can cut through
  // a steeply narrowing outer wall before reaching the requested height.
  const cavityOvercutRadius = topRadius
    + radiusSlope * overcutMm
    - parameters.wallThicknessMm
  const cavityHeight = parameters.heightMm - parameters.bottomThicknessMm + overcutMm
  const holes = resolveDrainageHoles(parameters.drainageHoles, {
    cavityFloorRadius: cavityBottomRadius,
    wallThicknessMm: parameters.wallThicknessMm,
    bottomThicknessMm: parameters.bottomThicknessMm,
  })
  const inputs: Manifold[] = [outer]
  try {
    const treatment = parameters.edgeTreatment
    if (treatment.style === 'none') {
      inputs.push(translateAndDeleteSource(module.Manifold.cylinder(cavityHeight, cavityBottomRadius, cavityOvercutRadius, tessellation.circularSegments), 0, 0, parameters.bottomThicknessMm))
    } else {
      const axialTreatment = resolveAxialEdgeTreatment(treatment, {
        bottomWallMm: parameters.wallThicknessMm,
        bottomThicknessMm: parameters.bottomThicknessMm,
        topWallMm: parameters.wallThicknessMm,
      })
      const floorSizeMm = axialTreatment.bottomSizeMm
      const rimSizeMm = axialTreatment.topSizeMm
      const edgeSegments = treatment.style === 'rounded' ? (tessellation.edgeSegments ?? 3) : 1
      const floor = treatment.style === 'rounded'
        ? roundedRadialTransition(cavityBottomRadius, parameters.bottomThicknessMm, floorSizeMm, false, edgeSegments, true)
        : [[cavityBottomRadius - floorSizeMm, parameters.bottomThicknessMm], [cavityBottomRadius, parameters.bottomThicknessMm + floorSizeMm]] as Array<[number, number]>
      const rimBaseRadius = topRadius - parameters.wallThicknessMm
      const rim = treatment.style === 'rounded'
        ? roundedRadialTransition(rimBaseRadius, parameters.heightMm, rimSizeMm, true, edgeSegments, false).reverse()
        : [[rimBaseRadius, parameters.heightMm - rimSizeMm], [rimBaseRadius + rimSizeMm, parameters.heightMm]] as Array<[number, number]>
      inputs.push(revolvedProfile(module, [[0, parameters.bottomThicknessMm], ...floor, ...rim, [cavityOvercutRadius + rimSizeMm, parameters.heightMm + overcutMm], [0, parameters.heightMm + overcutMm]], tessellation.circularSegments))
    }

    const holeHeight = parameters.bottomThicknessMm + 2
    for (const hole of holes) {
      const [x, y] = hole.positionMm
      const holeRadius = hole.diameterMm / 2
      const holeSegments = Math.max(24, tessellation.circularSegments / 3)
      if (parameters.drainageHoleRounding.enabled) {
        const rounding = parameters.drainageHoleRounding.radiusMm
        const edgeSegments = tessellation.edgeSegments ?? 3
        const bottom = roundedRadialTransition(holeRadius, 0, rounding, true, edgeSegments, true)
        const top = hole.countersink ? [[holeRadius, parameters.bottomThicknessMm + 1] as [number, number]] : roundedRadialTransition(holeRadius, parameters.bottomThicknessMm, rounding, true, edgeSegments, false).reverse()
        inputs.push(translateAndDeleteSource(revolvedProfile(module, [[0, -1], [holeRadius + rounding, -1], ...bottom, ...top, [holeRadius + (hole.countersink ? 0 : rounding), parameters.bottomThicknessMm + 1], [0, parameters.bottomThicknessMm + 1]], holeSegments), x, y, 0))
      } else {
        inputs.push(translateAndDeleteSource(module.Manifold.cylinder(holeHeight, holeRadius, holeRadius, holeSegments), x, y, -1))
      }
      if (hole.countersink) {
        const countersinkOvercutMm = 0.05
        inputs.push(translateAndDeleteSource(module.Manifold.cylinder(
          hole.countersink.depthMm + countersinkOvercutMm,
          holeRadius,
          hole.countersink.diameterMm / 2,
          Math.max(24, tessellation.circularSegments / 3),
        ), x, y, parameters.bottomThicknessMm - hole.countersink.depthMm))
      }
    }

    inputs.push(...buildPotBottomRibCutters(module, parameters, quality, tessellation.circularSegments, bottomRibRadiusMm))
    if (connectorGroove) {
      inputs.push(annularPrism(
        module,
        connectorGroove.innerRadiusMm,
        connectorGroove.outerRadiusMm,
        -0.1,
        connectorGroove.depthMm,
        tessellation.circularSegments,
      ))
    }

    const hollowPot = discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.difference(inputs), inputs.splice(0)))
    const rigidity = buildPotRigidityRibs(module, parameters, tessellation.circularSegments)
    if (!rigidity.length) return hollowPot
    return discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.union([hollowPot, ...rigidity]), [hollowPot, ...rigidity]))
  } catch (error) {
    for (const input of inputs) input.delete()
    throw error
  }
}

function buildPot(module: ManifoldToplevel, config: Extract<DesignConfig, { type: 'pot' }>, tessellation: Tessellation, quality: BuildQuality, warnings: string[]): Manifold {
  const outer = buildTexturedPotOuter(module, config.parameters, config.texture, tessellation, quality, warnings)
  return finishPot(module, config.parameters, outer, tessellation, quality)
}

function buildPotWithTray(
  module: ManifoldToplevel,
  config: Extract<DesignConfig, { type: 'pot-with-tray' }>,
  tessellation: Tessellation,
  quality: BuildQuality,
  warnings: string[],
): { pot: Manifold; tray: Manifold } {
  const parameters = config.parameters
  const tray = config.tray
  const connector = trayConnectorDimensions(parameters, tray)
  const totalHeightMm = parameters.heightMm + tray.heightMm
  const combinedParameters: PotParameters = {
    ...parameters,
    heightMm: totalHeightMm,
    bottomDiameterMm: connector.trayBottomRadiusMm * 2,
  }
  const combinedAxialTreatment = resolveAxialEdgeTreatment(parameters.edgeTreatment, {
    bottomWallMm: tray.wallThicknessMm,
    bottomThicknessMm: tray.bottomThicknessMm,
    topWallMm: parameters.wallThicknessMm,
  })
  let combinedOuter: Manifold | undefined = buildTexturedPotOuter(
    module,
    combinedParameters,
    config.texture,
    tessellation,
    quality,
    warnings,
    combinedAxialTreatment,
  )
  let potOuter: Manifold | undefined
  let trayOuter: Manifold | undefined
  let pot: Manifold | undefined
  let trayResult: Manifold | undefined
  try {
    potOuter = translateAndDeleteSource(clipByZ(module, combinedOuter, tray.heightMm, parameters.heightMm), 0, 0, -tray.heightMm)
    trayOuter = clipByZ(module, combinedOuter, 0, tray.heightMm)
    combinedOuter.delete()
    combinedOuter = undefined

    const ownedPotOuter = potOuter
    potOuter = undefined
    pot = finishPot(module, parameters, ownedPotOuter, tessellation, quality, connector.bottomRibRadiusMm, {
      innerRadiusMm: connector.grooveInnerRadiusMm,
      outerRadiusMm: connector.grooveOuterRadiusMm,
      depthMm: tray.engagementDepthMm,
    })
    const slope = (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm
    const cavityHeightMm = tray.heightMm - tray.bottomThicknessMm + 1
    const cavityBottomRadiusMm = connector.trayBottomRadiusMm + slope * tray.bottomThicknessMm - tray.wallThicknessMm
    const cavityTopRadiusMm = parameters.bottomDiameterMm / 2 + slope - tray.wallThicknessMm
    const cavity = translateAndDeleteSource(module.Manifold.cylinder(
      cavityHeightMm,
      cavityBottomRadiusMm,
      cavityTopRadiusMm,
      tessellation.circularSegments,
    ), 0, 0, tray.bottomThicknessMm)
    const ownedTrayOuter = trayOuter
    trayOuter = undefined
    const hollowTray = discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.difference([ownedTrayOuter, cavity]), [ownedTrayOuter, cavity]))
    const tongue = annularPrism(
      module,
      connector.tongueInnerRadiusMm,
      connector.tongueOuterRadiusMm,
      tray.heightMm - 0.25,
      tray.heightMm + connector.tongueHeightMm,
      tessellation.circularSegments,
    )
    // Moving the groove behind the nominal pot wall keeps it clear of deep
    // recessed texture. This shallow hidden shoulder joins the correspondingly
    // inset tongue to the tray wall without changing the exposed projection.
    const tongueShoulder = annularPrism(
      module,
      connector.tongueInnerRadiusMm,
      parameters.bottomDiameterMm / 2,
      tray.heightMm - 0.25,
      tray.heightMm,
      tessellation.circularSegments,
    )
    trayResult = discardNumericalShells(evaluateAndDisposeInputs(
      module.Manifold.union([hollowTray, tongueShoulder, tongue]),
      [hollowTray, tongueShoulder, tongue],
    ))
    return { pot, tray: trayResult }
  } catch (error) {
    pot?.delete()
    trayResult?.delete()
    potOuter?.delete()
    trayOuter?.delete()
    combinedOuter?.delete()
    throw error
  }
}

function buildDrawer(
  module: ManifoldToplevel,
  config: Extract<DesignConfig, { type: 'drawer' }>,
  tessellation: Tessellation,
  quality: BuildQuality,
): Manifold {
  const parameters = config.parameters
  const owned: Manifold[] = []
  try {
    const vector = config.texture.kind !== 'smooth' && config.texture.kind !== 'noise' ? config.texture : undefined
    const shellTexture = vector ? { kind: 'smooth' as const } : config.texture
    owned.push(manifoldFromRaw(module, buildDrawerOuterMesh(parameters, shellTexture, config.textureWalls, tessellation)))
    if (vector) {
      const parts = buildDrawerVectorTextureMeshes(parameters, vector, config.textureWalls, vectorOptions(config, quality, tessellation)).map((raw) => manifoldFromRaw(module, raw))
      if (parts.length) {
        const shell = owned.shift()!
        const result = vector.reliefMode === 'emboss' ? module.Manifold.union([shell, ...parts]) : module.Manifold.difference([shell, ...parts])
        owned.push(discardNumericalShells(evaluateAndDisposeInputs(result, [shell, ...parts])))
      }
    }
    owned.push(manifoldFromRaw(module, buildDrawerCavityMesh(parameters, tessellation)))
    owned.push(...buildDrawerBottomRibCutters(module, parameters, quality))
    const hollowDrawer = discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.difference(owned), owned.splice(0)))
    const rigidity = buildDrawerRigidityRibMeshes(parameters).map((raw) => manifoldFromRaw(module, raw))
    const reinforcedShell = rigidity.length
      ? discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.union([hollowDrawer, ...rigidity]), [hollowDrawer, ...rigidity]))
      : hollowDrawer

    if (parameters.handleStyle === 'projecting') {
      owned.push(reinforcedShell)
      owned.push(manifoldFromRaw(module, buildDrawerHandleMesh(parameters)))
      return discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.union(owned), owned.splice(0)))
    }

    const bounds = drawerHandleBounds(parameters)
    const wallMm = parameters.wallThicknessMm
    const outerFrontY = -parameters.depthMm / 2
    const innerFrontY = outerFrontY + wallMm
    const ribStartY = outerFrontY - wallMm
    const ribEndY = innerFrontY + parameters.handleDepthMm
    const centerZ = (bounds.openingBottomZMm + bounds.openingTopZMm) / 2
    const segmentsPerCorner = Math.max(2, Math.ceil(tessellation.circularSegments / 12))
    owned.push(reinforcedShell)
    owned.push(roundedRectangleFrameAlongY(
      module,
      parameters.handleWidthMm,
      parameters.handleHeightMm,
      parameters.handleCornerRadiusMm,
      wallMm,
      ribStartY,
      ribEndY,
      centerZ,
      segmentsPerCorner,
    ))
    const reinforcedDrawer = evaluateAndDisposeInputs(module.Manifold.union(owned), owned.splice(0))

    const overcutMm = 1
    owned.push(reinforcedDrawer)
    owned.push(roundedRectanglePrismAlongY(
      module,
      parameters.handleWidthMm,
      parameters.handleHeightMm,
      parameters.handleCornerRadiusMm,
      ribStartY - overcutMm,
      ribEndY + overcutMm,
      centerZ,
      segmentsPerCorner,
    ))
    return discardNumericalShells(evaluateAndDisposeInputs(module.Manifold.difference(owned), owned.splice(0)))
  } catch (error) {
    for (const manifold of owned) manifold.delete()
    throw error
  }
}

function calculateVertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length)
  for (let offset = 0; offset < indices.length; offset += 3) {
    const ia = indices[offset] * 3
    const ib = indices[offset + 1] * 3
    const ic = indices[offset + 2] * 3
    const abx = positions[ib] - positions[ia]
    const aby = positions[ib + 1] - positions[ia + 1]
    const abz = positions[ib + 2] - positions[ia + 2]
    const acx = positions[ic] - positions[ia]
    const acy = positions[ic + 1] - positions[ia + 1]
    const acz = positions[ic + 2] - positions[ia + 2]
    const nx = aby * acz - abz * acy
    const ny = abz * acx - abx * acz
    const nz = abx * acy - aby * acx
    for (const index of [ia, ib, ic]) {
      normals[index] += nx
      normals[index + 1] += ny
      normals[index + 2] += nz
    }
  }

  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1
    normals[offset] /= length
    normals[offset + 1] /= length
    normals[offset + 2] /= length
  }
  return normals
}

function extractGeometry(manifold: Manifold, kind: ModelPartKind, initialWarnings: string[] = []): GeometryResult {
  const triangleCount = manifold.numTri()
  if (triangleCount > MAX_TRIANGLES) {
    throw new Error(`Model has ${triangleCount.toLocaleString()} triangles; the export limit is ${MAX_TRIANGLES.toLocaleString()}.`)
  }

  const source = manifold.getMesh()
  const positions = new Float32Array(source.numVert * 3)
  for (let vertex = 0; vertex < source.numVert; vertex += 1) {
    const sourceOffset = vertex * source.numProp
    const destinationOffset = vertex * 3
    positions[destinationOffset] = source.vertProperties[sourceOffset]
    positions[destinationOffset + 1] = source.vertProperties[sourceOffset + 1]
    positions[destinationOffset + 2] = source.vertProperties[sourceOffset + 2]
  }
  const indices = new Uint32Array(source.triVerts)
  const bounds = manifold.boundingBox()
  const warnings = [...initialWarnings, ...(triangleCount > 150_000 ? ['This detailed model may take longer to preview and slice.'] : [])]

  const mesh = { positions, indices, normals: calculateVertexNormals(positions, indices) }
  return {
    parts: [{ kind, mesh, previewOffsetMm: [0, 0, 0] }],
    stats: {
      boundsMm: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
      volumeMm3: manifold.volume(),
      triangleCount,
    },
    warnings,
  }
}

function extractPotWithTrayGeometry(
  pot: Manifold,
  tray: Manifold,
  config: Extract<DesignConfig, { type: 'pot-with-tray' }>,
  initialWarnings: string[],
): GeometryResult {
  const potResult = extractGeometry(pot, 'pot')
  const trayResult = extractGeometry(tray, 'tray')
  const triangleCount = potResult.stats.triangleCount + trayResult.stats.triangleCount
  if (triangleCount > MAX_TRIANGLES) {
    throw new Error(`Model has ${triangleCount.toLocaleString()} triangles; the export limit is ${MAX_TRIANGLES.toLocaleString()}.`)
  }
  const warnings = [
    ...initialWarnings,
    ...(triangleCount > 150_000 ? ['This detailed model may take longer to preview and slice.'] : []),
  ]
  return {
    parts: [
      { kind: 'tray', mesh: trayResult.parts[0].mesh, previewOffsetMm: [0, 0, 0] },
      { kind: 'pot', mesh: potResult.parts[0].mesh, previewOffsetMm: [0, 0, config.tray.heightMm + config.tray.previewGapMm] },
    ],
    stats: {
      boundsMm: [
        Math.max(potResult.stats.boundsMm[0], trayResult.stats.boundsMm[0]),
        Math.max(potResult.stats.boundsMm[1], trayResult.stats.boundsMm[1]),
        config.parameters.heightMm + config.tray.heightMm,
      ],
      volumeMm3: potResult.stats.volumeMm3 + trayResult.stats.volumeMm3,
      triangleCount,
    },
    warnings,
  }
}

export async function buildGeometry(config: DesignConfig, quality: BuildQuality): Promise<GeometryResult> {
  const parsed = designConfigSchema.safeParse(config)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid model settings.')

  const module = await getManifoldModule()
  const plan = planTessellation(parsed.data, quality)

  let manifold: Manifold | undefined
  let trayManifold: Manifold | undefined
  try {
    if (parsed.data.type === 'pot-with-tray') {
      const parts = buildPotWithTray(module, parsed.data, plan.tessellation, quality, plan.warnings)
      manifold = parts.pot
      trayManifold = parts.tray
      validateSingleSolid(manifold)
      validateSingleSolid(trayManifold)
      return extractPotWithTrayGeometry(manifold, trayManifold, parsed.data, plan.warnings)
    }
    manifold = parsed.data.type === 'pot'
      ? buildPot(module, parsed.data, plan.tessellation, quality, plan.warnings)
      : buildDrawer(module, parsed.data, plan.tessellation, quality)
    validateSingleSolid(manifold)
    return extractGeometry(manifold, parsed.data.type, plan.warnings)
  } finally {
    manifold?.delete()
    trayManifold?.delete()
  }
}

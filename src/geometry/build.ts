import type { DesignConfig, DrawerParameters, TextureConfig } from '../domain/design'
import { designConfigSchema } from '../domain/design'
import { cavityFloorRadius, resolveDrainageHoles } from '../domain/drainage'
import type { BuildQuality, MeshData, ModelStats } from '../domain/worker'
import type { Manifold, ManifoldToplevel } from 'manifold-3d'
import { getManifoldModule } from './manifold'
import {
  buildDrawerHandleMesh,
  buildDrawerOuterMesh,
  buildPotOuterMesh,
  type RawMesh,
  type Tessellation,
} from './mesh-builders'

const MAX_TRIANGLES = 500_000

export type GeometryResult = {
  mesh: MeshData
  stats: ModelStats
  warnings: string[]
}

const BASE_TESSELLATION: Record<BuildQuality, Tessellation> = {
  draft: { circularSegments: 48, verticalSegments: 10, drawerSideSegments: 24 },
  preview: { circularSegments: 72, verticalSegments: 16, drawerSideSegments: 36 },
  export: { circularSegments: 108, verticalSegments: 26, drawerSideSegments: 54 },
}

const TEXTURE_SAMPLES: Record<'low' | 'medium' | 'high', number> = {
  low: 4,
  medium: 6,
  high: 8,
}
const BUILD_SAMPLES: Record<BuildQuality, number> = { draft: 0.65, preview: 1, export: 1.35 }
const RAW_TRIANGLE_BUDGET: Record<BuildQuality, number> = { draft: 35_000, preview: 100_000, export: 240_000 }

export type TessellationPlan = { tessellation: Tessellation; warnings: string[] }

function textureFeatureScale(texture: TextureConfig): number {
  if (texture.kind === 'smooth') return Number.POSITIVE_INFINITY
  if (texture.kind === 'noise') return texture.scaleMm / 2 ** (texture.octaves - 1)
  if (texture.kind === 'honeycomb') return Math.min(texture.scaleMm, texture.spacingMm)
  if (texture.kind === 'voronoi') return Math.min(texture.scaleMm, texture.edgeWidthMm)
  return texture.scaleMm
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

  const samples = TEXTURE_SAMPLES[texture.quality] * BUILD_SAMPLES[quality]
  const featureScale = textureFeatureScale(texture)
  const height = config.parameters.heightMm
  const vertical = Math.max(base.verticalSegments, Math.ceil(height / featureScale * samples))
  const warnings: string[] = []

  if (config.type === 'pot') {
    const perimeter = Math.PI * Math.max(config.parameters.bottomDiameterMm, config.parameters.topDiameterMm)
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

function buildPot(module: ManifoldToplevel, config: Extract<DesignConfig, { type: 'pot' }>, tessellation: Tessellation): Manifold {
  const parameters = config.parameters
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
  const inputs: Manifold[] = []
  try {
    inputs.push(manifoldFromRaw(module, buildPotOuterMesh(parameters, config.texture, tessellation)))
    inputs.push(translateAndDeleteSource(module.Manifold.cylinder(
      cavityHeight,
      cavityBottomRadius,
      cavityOvercutRadius,
      tessellation.circularSegments,
    ), 0, 0, parameters.bottomThicknessMm))

    const holeHeight = parameters.bottomThicknessMm + 2
    for (const hole of holes) {
      const [x, y] = hole.positionMm
      const holeRadius = hole.diameterMm / 2
      inputs.push(translateAndDeleteSource(module.Manifold.cylinder(
        holeHeight,
        holeRadius,
        holeRadius,
        Math.max(24, tessellation.circularSegments / 3),
      ), x, y, -1))
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

    const result = module.Manifold.difference(inputs)
    return evaluateAndDisposeInputs(result, inputs.splice(0))
  } catch (error) {
    for (const input of inputs) input.delete()
    throw error
  }
}

function buildDrawer(
  module: ManifoldToplevel,
  config: Extract<DesignConfig, { type: 'drawer' }>,
  tessellation: Tessellation,
): Manifold {
  const parameters = config.parameters
  if (parameters.handleProjectionMm > parameters.heightMm - parameters.bottomThicknessMm) {
    throw new Error('Handle projection is too deep to keep its underside at a printable 45-degree angle.')
  }
  const owned: Manifold[] = []
  try {
    owned.push(manifoldFromRaw(module, buildDrawerOuterMesh(parameters, config.texture, config.textureWalls, tessellation)))
    owned.push(manifoldFromRaw(module, buildDrawerHandleMesh(parameters)))
    const joined = evaluateAndDisposeInputs(module.Manifold.union(owned), owned.splice(0))
    owned.push(joined)

    const cavityWidth = parameters.widthMm - 2 * parameters.wallThicknessMm
    const cavityDepth = parameters.depthMm - 2 * parameters.wallThicknessMm
    const cavityHeight = parameters.heightMm - parameters.bottomThicknessMm + 1
    owned.push(translateAndDeleteSource(
      module.Manifold.cube([cavityWidth, cavityDepth, cavityHeight], true),
      0,
      0,
      parameters.bottomThicknessMm + cavityHeight / 2,
    ))
    const result = module.Manifold.difference(owned)
    return evaluateAndDisposeInputs(result, owned.splice(0))
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

function extractGeometry(manifold: Manifold, initialWarnings: string[] = []): GeometryResult {
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

  return {
    mesh: { positions, indices, normals: calculateVertexNormals(positions, indices) },
    stats: {
      boundsMm: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
      volumeMm3: manifold.volume(),
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
  try {
    manifold = parsed.data.type === 'pot'
      ? buildPot(module, parsed.data, plan.tessellation)
      : buildDrawer(module, parsed.data, plan.tessellation)
    validateSingleSolid(manifold)
    return extractGeometry(manifold, plan.warnings)
  } finally {
    manifold?.delete()
  }
}

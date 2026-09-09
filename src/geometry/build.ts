import type { DesignConfig, PotParameters } from '../domain/design'
import { designConfigSchema } from '../domain/design'
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

const TESSELLATION: Record<BuildQuality, Tessellation> = {
  draft: { circularSegments: 72, verticalSegments: 16, drawerSideSegments: 36 },
  preview: { circularSegments: 120, verticalSegments: 28, drawerSideSegments: 54 },
  export: { circularSegments: 180, verticalSegments: 44, drawerSideSegments: 72 },
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

export function drainageCenters(
  parameters: PotParameters,
  cavityFloorRadius: number,
): Array<readonly [number, number]> {
  if (parameters.drainageHoleCount === 1) return [[0, 0]]

  const holeRadius = parameters.drainageHoleDiameterMm / 2
  const structuralMargin = Math.max(2, parameters.wallThicknessMm)
  const maximumRingRadius = cavityFloorRadius - holeRadius - structuralMargin
  const minimumRingRadius = holeRadius / Math.sin(Math.PI / parameters.drainageHoleCount) + 0.5

  if (maximumRingRadius < minimumRingRadius) {
    throw new Error('Drainage holes cannot fit without overlapping or weakening the base wall.')
  }

  const ringRadius = Math.min(maximumRingRadius, Math.max(minimumRingRadius, cavityFloorRadius * 0.55))
  return Array.from({ length: parameters.drainageHoleCount }, (_, index) => {
    const angle = (index / parameters.drainageHoleCount) * Math.PI * 2
    return [ringRadius * Math.cos(angle), ringRadius * Math.sin(angle)] as const
  })
}

function buildPot(module: ManifoldToplevel, config: Extract<DesignConfig, { type: 'pot' }>, tessellation: Tessellation): Manifold {
  const parameters = config.parameters
  const bottomRadius = parameters.bottomDiameterMm / 2
  const topRadius = parameters.topDiameterMm / 2
  const radiusSlope = (topRadius - bottomRadius) / parameters.heightMm
  const cavityBottomRadius = bottomRadius
    + radiusSlope * parameters.bottomThicknessMm
    - parameters.wallThicknessMm
  const overcutMm = 1
  // Extrapolate with the same slope through the overcut. Using the rim radius
  // directly as the cutter's high radius changes the taper and can cut through
  // a steeply narrowing outer wall before reaching the requested height.
  const cavityOvercutRadius = topRadius
    + radiusSlope * overcutMm
    - parameters.wallThicknessMm
  const cavityHeight = parameters.heightMm - parameters.bottomThicknessMm + overcutMm
  const centers = drainageCenters(parameters, cavityBottomRadius)
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
    const holeRadius = parameters.drainageHoleDiameterMm / 2
    for (const [x, y] of centers) {
      inputs.push(translateAndDeleteSource(module.Manifold.cylinder(
        holeHeight,
        holeRadius,
        holeRadius,
        Math.max(24, tessellation.circularSegments / 3),
      ), x, y, -1))
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
    owned.push(manifoldFromRaw(module, buildDrawerOuterMesh(parameters, config.texture, tessellation)))
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

function extractGeometry(manifold: Manifold): GeometryResult {
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
  const warnings = triangleCount > 150_000 ? ['This detailed model may take longer to preview and slice.'] : []

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
  const tessellation = { ...TESSELLATION[quality] }
  if (config.texture.kind !== 'smooth') {
    tessellation.circularSegments = Math.max(tessellation.circularSegments, config.texture.density * 5)
    tessellation.drawerSideSegments = Math.max(tessellation.drawerSideSegments, config.texture.density * 4)
  }

  let manifold: Manifold | undefined
  try {
    manifold = parsed.data.type === 'pot'
      ? buildPot(module, parsed.data, tessellation)
      : buildDrawer(module, parsed.data, tessellation)
    validateSingleSolid(manifold)
    return extractGeometry(manifold)
  } finally {
    manifold?.delete()
  }
}

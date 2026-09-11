import { DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY, TEXTURE_KINDS, createTextureDefault, trayConnectorDimensions, type DesignConfig, type DrawerTextureWalls } from '../domain/design'
import type { BuildQuality, MeshData } from '../domain/worker'
import { cavityFloorRadius, generateDrainageLayout, resolveDrainageHoles, type DrainageHole } from '../domain/drainage'
import { describe, expect, it } from 'vitest'
import { buildGeometry, planTessellation, roundedRectangleContour } from './build'
import { concentricRibRadii, evenlySpacedCenterlines, roundedVProfile } from './bottom-ribs'
import { buildDrawerRigidityRibMeshes, rigidityRibCenterlines, roundedRibProfile, topAnchoredEvenlySpacedHoopElevations } from './rigidity-ribs'
import { buildDrawerHandleMesh, buildDrawerOuterMesh, drawerHandleBounds, potTexturePerimeter, resolveAxialEdgeTreatment } from './mesh-builders'
import { encodeBinaryStl } from './stl'
import { textureDisplacement, textureSignal, type SurfaceSample } from './textures'

const potSample: SurfaceSample = { uMm: 0, perimeterMm: 320, zMm: 50, heightMm: 100, xMm: 50, yMm: 0 }
const CELL_TEXTURE_QUALITY_CASES = (['honeycomb', 'voronoi'] as const).flatMap((kind) =>
  (['draft', 'preview', 'export'] satisfies BuildQuality[]).flatMap((quality) =>
    (['emboss', 'recess'] as const).map((reliefMode) => ({ kind, quality, reliefMode })),
  ),
)

function intersectionsAlongY(positions: Float32Array, indices: Uint32Array, x: number, z: number): number[] {
  const intersections: number[] = []
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertex = (corner: number) => {
      const index = indices[offset + corner] * 3
      return { x: positions[index], y: positions[index + 1], z: positions[index + 2] }
    }
    const a = vertex(0); const b = vertex(1); const c = vertex(2)
    const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z)
    if (Math.abs(denominator) < 1e-8) continue
    const wa = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator
    const wb = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator
    const wc = 1 - wa - wb
    if (wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7) intersections.push(wa * a.y + wb * b.y + wc * c.y)
  }
  return intersections
}

function intersectionsAlongX(positions: Float32Array, indices: Uint32Array, y: number, z: number): number[] {
  const intersections: number[] = []
  for (let offset = 0; offset < indices.length; offset += 3) {
    const vertex = (corner: number) => {
      const index = indices[offset + corner] * 3
      return { x: positions[index], y: positions[index + 1], z: positions[index + 2] }
    }
    const a = vertex(0); const b = vertex(1); const c = vertex(2)
    const denominator = (b.z - c.z) * (a.y - c.y) + (c.y - b.y) * (a.z - c.z)
    if (Math.abs(denominator) < 1e-8) continue
    const wa = ((b.z - c.z) * (y - c.y) + (c.y - b.y) * (z - c.z)) / denominator
    const wb = ((c.z - a.z) * (y - c.y) + (a.y - c.y) * (z - c.z)) / denominator
    const wc = 1 - wa - wb
    if (wa >= -1e-7 && wb >= -1e-7 && wc >= -1e-7) intersections.push(wa * a.x + wb * b.x + wc * c.x)
  }
  return intersections
}

/** Test-only mesh surface area; production stats intentionally do not expose it. */
function triangleArea(positions: Float32Array, indices: Uint32Array): number {
  let area = 0
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3; const b = indices[offset + 1] * 3; const c = indices[offset + 2] * 3
    const ab: [number, number, number] = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]]
    const ac: [number, number, number] = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]]
    area += Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]) / 2
  }
  return area
}

function coplanarBottomArea(mesh: MeshData): number {
  let area = 0
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const indices = [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]]
    if (!indices.every((index) => Math.abs(mesh.positions[index * 3 + 2]) < 1e-4)) continue
    const [a, b, c] = indices.map((index) => [mesh.positions[index * 3], mesh.positions[index * 3 + 1]])
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
  }
  return area
}

function hasVertexAtRadiusAndZ(mesh: MeshData, radiusMm: number, zMm: number, toleranceMm = 0.05): boolean {
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    const radius = Math.hypot(mesh.positions[offset], mesh.positions[offset + 1])
    if (Math.abs(radius - radiusMm) < toleranceMm && Math.abs(mesh.positions[offset + 2] - zMm) < toleranceMm) return true
  }
  return false
}

function singleMesh(result: Awaited<ReturnType<typeof buildGeometry>>): MeshData {
  expect(result.parts).toHaveLength(1)
  return result.parts[0].mesh
}

describe('geometry generation', () => {
  it('places straight and concentric rib centerlines in equal interior gaps', () => {
    expect(evenlySpacedCenterlines(120, 5)).toEqual([-40, -20, 0, 20, 40])
    expect(evenlySpacedCenterlines(90, 2)).toEqual([-15, 15])
    expect(evenlySpacedCenterlines(90, 0)).toEqual([])
    expect(concentricRibRadii(50, 3)).toEqual([12.5, 25, 37.5])
  })

  it('builds a symmetric rounded V profile at the exact requested width and depth', () => {
    const profile = roundedVProfile(3, 2, 5)
    const surface = profile.filter(([, z]) => z >= 0)
    const xValues = surface.map(([x]) => x)
    const zValues = surface.map(([, z]) => z)

    expect(Math.min(...xValues)).toBeCloseTo(-1.5, 10)
    expect(Math.max(...xValues)).toBeCloseTo(1.5, 10)
    expect(Math.max(...zValues)).toBeCloseTo(2, 10)
    for (const [x, z] of surface) {
      const mirror = surface.find(([otherX]) => Math.abs(otherX + x) < 1e-10)
      expect(mirror?.[1]).toBeCloseTo(z, 10)
    }
  })

  it('builds a strongly rounded rigidity profile at the exact requested width and projection', () => {
    const profile = roundedRibProfile(4, 2, 5)

    expect(profile).toHaveLength(11)
    expect(profile[0]).toEqual([-2, 0])
    expect(profile[5]).toEqual([0, 2])
    expect(profile[10][0]).toBeCloseTo(2, 10)
    expect(profile[10][1]).toBeCloseTo(0, 10)
    for (const [offset, projection] of profile) {
      const mirror = profile.find(([otherOffset]) => Math.abs(otherOffset + offset) < 1e-10)
      expect(mirror?.[1]).toBeCloseTo(projection, 10)
    }
    expect(profile[1][1]).toBeLessThan(0.4)
    expect(profile[4][1]).toBeGreaterThan(1.6)
  })

  it('anchors hoops at the top and spaces them evenly above the gusset', () => {
    expect(topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 0)).toEqual([])
    const hoops = topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 3)
    const low = 3 + 4 + 0.6
    const high = 100 - 4 / 2
    const pitch = (high - low) / 3
    expect(hoops[0]).toBeCloseTo(high)
    expect(hoops[1] - hoops[0]).toBeCloseTo(-pitch)
    expect(hoops[2] - hoops[1]).toBeCloseTo(-pitch)
    const defaultHoops = topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 2, 3)
    const defaultLow = 3 + 3 + 4 + 0.6
    const defaultHigh = 100 - 4 / 2
    expect(defaultHoops[0]).toBeCloseTo(defaultHigh)
    expect(defaultHoops[1]).toBeCloseTo(defaultHigh - (defaultHigh - defaultLow) / 2)
    expect(rigidityRibCenterlines(116, 3)).toEqual([-29, 0, 29])
  })

  it('connects a top-anchored outside hoop without changing smooth pot height', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const config = {
      ...DEFAULT_POT,
      texture: createTextureDefault('smooth'),
      parameters: {
        ...DEFAULT_POT.parameters,
        bottomDiameterMm: 100,
        topDiameterMm: 100,
        rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs, placement: 'outside' as const, count: 1 },
      },
    } satisfies Extract<DesignConfig, { type: 'pot' }>
    const baseline = await buildGeometry({
      ...config,
      parameters: { ...config.parameters, rigidityRibs: { ...config.parameters.rigidityRibs, enabled: false } },
    }, 'draft')
    const reinforced = await buildGeometry(config, 'draft')
    const mesh = singleMesh(reinforced)
    const hoop = config.parameters.rigidityRibs
    const hoopCenter = config.parameters.heightMm - hoop.baseWidthMm / 2
    const outerRadius = config.parameters.topDiameterMm / 2

    expect(hasVertexAtRadiusAndZ(mesh, outerRadius + hoop.projectionMm, hoopCenter)).toBe(true)
    expect(reinforced.stats.boundsMm[2]).toBeCloseTo(baseline.stats.boundsMm[2], 3)
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true)
  })

  it.each([{ name: 'pot', config: DEFAULT_POT }, { name: 'drawer', config: DEFAULT_DRAWER }] as const)('adds connected inside rigidity without changing $name exterior bounds', async ({ config }) => {
    const disabled = { ...config, parameters: { ...config.parameters, rigidityRibs: { ...config.parameters.rigidityRibs, enabled: false } } } as DesignConfig
    const reinforced = await buildGeometry(config, 'draft')
    const baseline = await buildGeometry(disabled, 'draft')

    expect(reinforced.stats.volumeMm3).toBeGreaterThan(baseline.stats.volumeMm3)
    reinforced.stats.boundsMm.forEach((dimension, index) => expect(dimension).toBeCloseTo(baseline.stats.boundsMm[index], 3))
    expect(triangleArea(singleMesh(reinforced).positions, singleMesh(reinforced).indices)).toBeLessThanOrEqual(triangleArea(singleMesh(baseline).positions, singleMesh(baseline).indices) * 1.1)
  })

  it.each([{ name: 'pot', config: DEFAULT_POT }, { name: 'drawer', config: DEFAULT_DRAWER }] as const)('allows outside $name rigidity to expand lateral bounds but not height', async ({ config }) => {
    const outside = { ...config, texture: createTextureDefault('smooth'), parameters: { ...config.parameters, rigidityRibs: { ...config.parameters.rigidityRibs, placement: 'outside' as const } } } as DesignConfig
    const inside = { ...outside, parameters: { ...outside.parameters, rigidityRibs: { ...outside.parameters.rigidityRibs, placement: 'inside' as const } } } as DesignConfig
    const outer = await buildGeometry(outside, 'draft')
    const inner = await buildGeometry(inside, 'draft')

    expect(outer.stats.boundsMm[2]).toBeCloseTo(inner.stats.boundsMm[2], 3)
    if (config.type === 'pot') {
      const cylindrical = { ...outside, parameters: { ...outside.parameters, bottomDiameterMm: 100, topDiameterMm: 100 } } as DesignConfig
      const cylindricalInner = { ...cylindrical, parameters: { ...cylindrical.parameters, rigidityRibs: { ...cylindrical.parameters.rigidityRibs, placement: 'inside' as const } } } as DesignConfig
      const expanded = await buildGeometry(cylindrical, 'draft')
      const baseline = await buildGeometry(cylindricalInner, 'draft')
      expect(expanded.stats.boundsMm[0] - baseline.stats.boundsMm[0]).toBeCloseTo(2 * cylindrical.parameters.rigidityRibs.wallBottomGussetMm, 2)
    } else expect(outer.stats.boundsMm[0]).toBeGreaterThan(inner.stats.boundsMm[0])
  })

  it('extends both smooth drawer structural axes by the outside projection or gusset', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const extent = Math.max(DEFAULT_DRAWER.parameters.rigidityRibs.projectionMm, DEFAULT_DRAWER.parameters.rigidityRibs.wallBottomGussetMm)
    const outside = { ...DEFAULT_DRAWER.parameters, rigidityRibs: { ...DEFAULT_DRAWER.parameters.rigidityRibs, placement: 'outside' as const } }
    const inside = { ...outside, rigidityRibs: { ...outside.rigidityRibs, placement: 'inside' as const } }
    const bounds = (meshes: ReturnType<typeof buildDrawerRigidityRibMeshes>) => {
      const positions = meshes.flatMap((mesh) => Array.from(mesh.positions))
      const axis = (offset: number) => Math.max(...positions.filter((_, index) => index % 3 === offset)) - Math.min(...positions.filter((_, index) => index % 3 === offset))
      return [axis(0), axis(1)] as const
    }
    const [outsideX, outsideY] = bounds(buildDrawerRigidityRibMeshes(outside, 3))
    const [insideX, insideY] = bounds(buildDrawerRigidityRibMeshes(inside, 3))

    expect(insideX).toBeCloseTo(DEFAULT_DRAWER.parameters.widthMm, 6)
    expect(insideY).toBeCloseTo(DEFAULT_DRAWER.parameters.depthMm, 6)
    expect(outsideX - insideX).toBeCloseTo(2 * extent, 6)
    expect(outsideY - insideY).toBeCloseTo(2 * extent, 6)
  })

  it('expands smooth drawer output bounds in both axes for outside rigidity while inside preserves baseline bounds', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const rigidityRibs = { ...DEFAULT_DRAWER.parameters.rigidityRibs, wallBottomGussetMm: 20 }
    const base = { ...DEFAULT_DRAWER, texture: createTextureDefault('smooth'), parameters: { ...DEFAULT_DRAWER.parameters, rigidityRibs } } as DesignConfig
    const inside = { ...base, parameters: { ...base.parameters, rigidityRibs: { ...base.parameters.rigidityRibs, placement: 'inside' as const } } } as DesignConfig
    const outside = { ...base, parameters: { ...base.parameters, rigidityRibs: { ...base.parameters.rigidityRibs, placement: 'outside' as const } } } as DesignConfig
    const disabled = { ...inside, parameters: { ...inside.parameters, rigidityRibs: { ...inside.parameters.rigidityRibs, enabled: false } } } as DesignConfig
    const extent = 20
    const [insideResult, outsideResult, baseline] = await Promise.all([
      buildGeometry(inside, 'draft'), buildGeometry(outside, 'draft'), buildGeometry(disabled, 'draft'),
    ])

    insideResult.stats.boundsMm.forEach((value, axis) => expect(value).toBeCloseTo(baseline.stats.boundsMm[axis], 3))
    expect(outsideResult.stats.boundsMm[0]).toBeCloseTo(DEFAULT_DRAWER.parameters.widthMm + 2 * extent, 2)
    expect(outsideResult.stats.boundsMm[1]).toBeCloseTo(DEFAULT_DRAWER.parameters.depthMm + 2 * extent, 2)
  })

  it('keeps exterior rigidity connected with textured surfaces and a recessed handle', async () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    const pot = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs, placement: 'outside' } } }, 'draft')
    const drawer = await buildGeometry({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed', handlePositionPercent: 50, rigidityRibs: { ...DEFAULT_DRAWER.parameters.rigidityRibs, placement: 'outside' } },
    }, 'draft')

    expect(pot.stats.volumeMm3).toBeGreaterThan(0)
    expect(drawer.stats.volumeMm3).toBeGreaterThan(0)
  })

  it('places inside gusset surfaces above each model cavity floor', async () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    const pot = await buildGeometry({ ...DEFAULT_POT, texture: createTextureDefault('smooth') }, 'draft')
    const potFloor = DEFAULT_POT.parameters.bottomThicknessMm
    const potSection = intersectionsAlongX(singleMesh(pot).positions, singleMesh(pot).indices, 0, potFloor + DEFAULT_POT.parameters.rigidityRibs.wallBottomGussetMm / 2)
    expect(potSection.some((x) => Math.abs(x) > 45 && Math.abs(x) < 48)).toBe(true)

    const drawer = await buildGeometry({ ...DEFAULT_DRAWER, texture: createTextureDefault('smooth') }, 'draft')
    const drawerFloor = DEFAULT_DRAWER.parameters.bottomThicknessMm
    const drawerSection = intersectionsAlongY(singleMesh(drawer).positions, singleMesh(drawer).indices, 0, drawerFloor + DEFAULT_DRAWER.parameters.rigidityRibs.wallBottomGussetMm / 2)
    expect(drawerSection.some((y) => y > -42.5 && y < -40.5)).toBe(true)
  })

  it('keeps configured recessed-handle front rib centerlines while cutting the opening', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = {
      ...DEFAULT_DRAWER.parameters,
      handleStyle: 'recessed' as const,
      handlePositionPercent: 50,
      rigidityRibs: { ...DEFAULT_DRAWER.parameters.rigidityRibs, frontBackCount: 1, sideCount: 0 },
    }
    const result = await buildGeometry({ ...DEFAULT_DRAWER, parameters, texture: createTextureDefault('smooth') }, 'draft')
    const bounds = drawerHandleBounds(parameters)

    const openingHits = intersectionsAlongY(singleMesh(result).positions, singleMesh(result).indices, 0, (bounds.openingBottomZMm + bounds.openingTopZMm) / 2)
    expect(Math.min(...openingHits)).toBeGreaterThan(0)

    const ribSegmentHits = intersectionsAlongY(singleMesh(result).positions, singleMesh(result).indices, 0, bounds.topZMm + 3)
    expect(ribSegmentHits.some((y) => y > -42.5 && y < -40.5)).toBe(true)
  })

  it.each([
    { name: 'pot', config: DEFAULT_POT },
    { name: 'drawer', config: DEFAULT_DRAWER },
  ] as const)('recesses the $name bottom without changing its external dimensions', async ({ config }) => {
    const disabled: DesignConfig = {
      ...config,
      parameters: {
        ...config.parameters,
        bottomRibs: { ...config.parameters.bottomRibs, enabled: false },
      },
    } as DesignConfig

    const recessed = await buildGeometry(config, 'draft')
    const smoothBottom = await buildGeometry(disabled, 'draft')

    expect(recessed.stats.volumeMm3).toBeLessThan(smoothBottom.stats.volumeMm3)
    recessed.stats.boundsMm.forEach((dimension, index) => expect(dimension).toBeCloseTo(smoothBottom.stats.boundsMm[index], 3))
    expect(Array.from(singleMesh(recessed).positions).every(Number.isFinite)).toBe(true)
  })

  it.each([
    { name: 'X', xCount: 1, yCount: 0, boundaryAxis: 0 as const, centerAxis: 1 as const, boundary: 60 },
    { name: 'Y', xCount: 0, yCount: 1, boundaryAxis: 1 as const, centerAxis: 0 as const, boundary: 45 },
  ])('runs a $name-direction drawer rib to both footprint edges', async ({ xCount, yCount, boundaryAxis, centerAxis, boundary }) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const config: DesignConfig = {
      ...DEFAULT_DRAWER,
      parameters: {
        ...DEFAULT_DRAWER.parameters,
        bottomRibs: { ...DEFAULT_DRAWER.parameters.bottomRibs, xCount, yCount },
      },
      texture: createTextureDefault('smooth'),
    }

    const result = await buildGeometry(config, 'draft')
    const points = Array.from({ length: singleMesh(result).positions.length / 3 }, (_, index) => [
      singleMesh(result).positions[index * 3],
      singleMesh(result).positions[index * 3 + 1],
      singleMesh(result).positions[index * 3 + 2],
    ])

    for (const sign of [-1, 1]) {
      expect(points.some((point) => (
        Math.abs(point[boundaryAxis] - sign * boundary) < 0.01
        && Math.abs(point[centerAxis]) < 0.01
        && Math.abs(point[2] - DEFAULT_DRAWER.parameters.bottomRibs.depthMm) < 0.01
      ))).toBe(true)
    }
  })

  it('builds the default pot as one printable solid with open drainage holes', async () => {
    const result = await buildGeometry(DEFAULT_POT, 'draft')
    expect(result.stats.triangleCount).toBeGreaterThan(100)
    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3)
    expect(singleMesh(result).indices.length).toBe(result.stats.triangleCount * 3)
    expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
  })

  it('builds the pot and tray as separate bed-oriented printable solids', async () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')

    const result = await buildGeometry({ ...DEFAULT_POT_WITH_TRAY, texture: createTextureDefault('smooth') }, 'draft')

    expect(result.parts.map((part) => part.kind)).toEqual(['tray', 'pot'])
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.heightMm + DEFAULT_POT_WITH_TRAY.tray.heightMm, 3)
    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(result.stats.triangleCount).toBe(result.parts.reduce((sum, part) => sum + part.mesh.indices.length / 3, 0))
    expect(result.parts[0].previewOffsetMm).toEqual([0, 0, 0])
    expect(result.parts[1].previewOffsetMm[2]).toBe(DEFAULT_POT_WITH_TRAY.tray.heightMm + DEFAULT_POT_WITH_TRAY.tray.previewGapMm)
    for (const part of result.parts) {
      const z = Array.from(part.mesh.positions).filter((_, index) => index % 3 === 2)
      expect(Math.min(...z)).toBeCloseTo(0, 4)
      expect(part.mesh.indices.length).toBeGreaterThan(0)
      expect(coplanarBottomArea(part.mesh)).toBeGreaterThan(1_000)
    }
    const connector = trayConnectorDimensions(DEFAULT_POT_WITH_TRAY.parameters, DEFAULT_POT_WITH_TRAY.tray)
    const trayPart = result.parts.find((part) => part.kind === 'tray')!
    const potPart = result.parts.find((part) => part.kind === 'pot')!
    const trayX = Array.from(trayPart.mesh.positions).filter((_, index) => index % 3 === 0)
    expect(Math.max(...trayX) - Math.min(...trayX)).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm, 3)
    expect(hasVertexAtRadiusAndZ(trayPart.mesh, connector.tongueInnerRadiusMm, DEFAULT_POT_WITH_TRAY.tray.heightMm + connector.tongueHeightMm)).toBe(true)
    expect(hasVertexAtRadiusAndZ(trayPart.mesh, connector.tongueOuterRadiusMm, DEFAULT_POT_WITH_TRAY.tray.heightMm + connector.tongueHeightMm)).toBe(true)
    expect(hasVertexAtRadiusAndZ(potPart.mesh, connector.grooveInnerRadiusMm, DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm)).toBe(true)
    expect(hasVertexAtRadiusAndZ(potPart.mesh, connector.grooveOuterRadiusMm, DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm)).toBe(true)
  })

  it('changes only the pot preview offset when configuring the tray preview gap', async () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const assembled = { ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 0 } }
    const exploded = { ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 37 } }

    const [assembledResult, explodedResult] = await Promise.all([
      buildGeometry(assembled, 'draft'),
      buildGeometry(exploded, 'draft'),
    ])

    expect(assembledResult.parts.find((part) => part.kind === 'tray')?.previewOffsetMm).toEqual([0, 0, 0])
    expect(assembledResult.parts.find((part) => part.kind === 'pot')?.previewOffsetMm).toEqual([0, 0, assembled.tray.heightMm])
    expect(explodedResult.parts.find((part) => part.kind === 'pot')?.previewOffsetMm).toEqual([0, 0, exploded.tray.heightMm + exploded.tray.previewGapMm])
    expect(explodedResult.stats).toEqual(assembledResult.stats)
    expect(explodedResult.parts.map((part) => part.mesh.positions)).toEqual(assembledResult.parts.map((part) => part.mesh.positions))
  })

  it('keeps the tray projection flush and applies the requested connector clearance', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const connector = trayConnectorDimensions(DEFAULT_POT_WITH_TRAY.parameters, DEFAULT_POT_WITH_TRAY.tray)
    const slope = (DEFAULT_POT_WITH_TRAY.parameters.topDiameterMm - DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm) / 2 / DEFAULT_POT_WITH_TRAY.parameters.heightMm

    expect(connector.trayBottomRadiusMm + slope * DEFAULT_POT_WITH_TRAY.tray.heightMm).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm / 2, 10)
    expect(connector.grooveOuterRadiusMm - connector.tongueOuterRadiusMm).toBeCloseTo(DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm, 10)
    expect(connector.tongueInnerRadiusMm - connector.grooveInnerRadiusMm).toBeCloseTo(DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm, 10)
    expect(DEFAULT_POT_WITH_TRAY.tray.engagementDepthMm - connector.tongueHeightMm).toBeCloseTo(DEFAULT_POT_WITH_TRAY.tray.fitClearanceMm, 10)
    expect(DEFAULT_POT_WITH_TRAY.parameters.bottomDiameterMm / 2 - connector.grooveOuterRadiusMm).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.wallThicknessMm, 10)
  })

  it('keeps a fully recessed tray texture clear of the connector groove', async () => {
    const base = createTextureDefault('voronoi')
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray' || base.kind !== 'voronoi') throw new Error('Broken tray fixture')
    const texture = {
      ...base,
      scaleMm: 12,
      bottomOffsetPercent: 0,
      topOffsetPercent: 0,
      bottomFadeMm: 0,
      topFadeMm: 0,
      reliefMode: 'recess' as const,
    }

    const result = await buildGeometry({ ...DEFAULT_POT_WITH_TRAY, texture }, 'draft')

    expect(result.parts).toHaveLength(2)
    expect(result.parts.every((part) => part.mesh.indices.length > 0)).toBe(true)
  })

  it('builds the default drawer with its attached handle projection', async () => {
    const result = await buildGeometry(DEFAULT_DRAWER, 'draft')
    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    expect(result.stats.boundsMm[0]).toBeGreaterThanOrEqual(DEFAULT_DRAWER.parameters.widthMm)
    expect(result.stats.boundsMm[1]).toBeGreaterThan(DEFAULT_DRAWER.parameters.depthMm)
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3)
  })

  it.each(['rounded', 'chamfered'] as const)('applies %s structural edges while preserving model envelopes', async (style) => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    const pot = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, edgeTreatment: { style, sizeMm: 1 } }, texture: createTextureDefault('smooth') }, 'draft')
    const drawer = await buildGeometry({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, edgeTreatment: { style, sizeMm: 1 } }, texture: createTextureDefault('smooth') }, 'draft')

    expect(pot.stats.boundsMm[0]).toBeCloseTo(DEFAULT_POT.parameters.topDiameterMm, 1)
    expect(pot.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3)
    expect(drawer.stats.boundsMm[0]).toBeCloseTo(DEFAULT_DRAWER.parameters.widthMm, 3)
    expect(drawer.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3)
    expect(Array.from(singleMesh(pot).positions).every(Number.isFinite)).toBe(true)
    expect(Array.from(singleMesh(drawer).positions).every(Number.isFinite)).toBe(true)
  })

  it('resolves independent bottom and rim sizes without enlarging small requests', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const maximum = { style: 'rounded' as const, sizeMm: 20 }
    const small = { style: 'rounded' as const, sizeMm: 0.4 }

    expect(resolveAxialEdgeTreatment(maximum, { bottomWallMm: 4, bottomThicknessMm: 6, topWallMm: 8 })).toEqual({
      bottomSizeMm: 2,
      topSizeMm: 4,
    })
    expect(resolveAxialEdgeTreatment(small, { bottomWallMm: 4, bottomThicknessMm: 6, topWallMm: 8 })).toEqual({
      bottomSizeMm: 0.4,
      topSizeMm: 0.4,
    })
  })

  it.each(['rounded', 'chamfered'] as const)('clamps an oversized %s maximum independently across every model', async (style) => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    const edgeTreatment = { style, sizeMm: 20 }
    const pot = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, edgeTreatment } }, 'draft')
    const assembly = await buildGeometry({ ...DEFAULT_POT_WITH_TRAY, parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, edgeTreatment } }, 'draft')
    const drawer = await buildGeometry({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, edgeTreatment } }, 'draft')

    expect(pot.parts).toHaveLength(1)
    expect(assembly.parts).toHaveLength(2)
    expect(drawer.parts).toHaveLength(1)
    for (const result of [pot, assembly, drawer]) {
      expect(result.stats.volumeMm3).toBeGreaterThan(0)
      expect(result.parts.every((part) => Array.from(part.mesh.positions).every(Number.isFinite))).toBe(true)
    }
    expect(pot.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3)
    expect(assembly.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT_WITH_TRAY.parameters.heightMm + DEFAULT_POT_WITH_TRAY.tray.heightMm, 3)
    expect(drawer.stats.boundsMm[0]).toBeGreaterThanOrEqual(DEFAULT_DRAWER.parameters.widthMm)
    expect(drawer.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3)
  }, 20_000)

  it('lets drawer body corners reach a maximum larger than its wall treatment', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = { ...DEFAULT_DRAWER.parameters, edgeTreatment: { style: 'rounded' as const, sizeMm: 20 } }

    const mesh = buildDrawerOuterMesh(parameters, createTextureDefault('smooth'), DEFAULT_DRAWER.textureWalls, {
      circularSegments: 24,
      drawerSideSegments: 8,
      verticalSegments: 8,
      edgeSegments: 3,
    })
    const sidePointsAboveBottomTreatment = Array.from({ length: mesh.positions.length / 3 }, (_, index) => ({
      x: mesh.positions[index * 3],
      y: mesh.positions[index * 3 + 1],
      z: mesh.positions[index * 3 + 2],
    })).filter((point) => Math.abs(point.x - parameters.widthMm / 2) < 1e-6 && Math.abs(point.z - parameters.wallThicknessMm / 2) < 1e-6)

    expect(Math.min(...sidePointsAboveBottomTreatment.map((point) => point.y))).toBeCloseTo(-parameters.depthMm / 2 + 20, 6)
  })

  it('rounds both drainage-hole mouths and preserves countersinks', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const first = DEFAULT_POT.parameters.drainageHoles[0]
    const rounded = { ...DEFAULT_POT.parameters, drainageHoles: [first], drainageHoleRounding: { enabled: true, radiusMm: 1 } }
    const countersunk = { ...rounded, drainageHoles: [{ ...first, countersink: { diameterMm: 10, depthMm: 1 } }] }

    const roundedResult = await buildGeometry({ ...DEFAULT_POT, parameters: rounded, texture: createTextureDefault('smooth') }, 'draft')
    const countersunkResult = await buildGeometry({ ...DEFAULT_POT, parameters: countersunk, texture: createTextureDefault('smooth') }, 'draft')

    expect(roundedResult.stats.volumeMm3).toBeGreaterThan(0)
    expect(countersunkResult.stats.volumeMm3).toBeLessThan(roundedResult.stats.volumeMm3)
  })

  it.each([
    { position: 0, expectedBottom: 38, expectedTop: 50 },
    { position: 50, expectedBottom: 19, expectedTop: 31 },
    { position: 100, expectedBottom: 0, expectedTop: 12 },
  ])('positions the projecting handle at $position%', ({ position, expectedBottom, expectedTop }) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = { ...DEFAULT_DRAWER.parameters, handlePositionPercent: position }
    const bounds = drawerHandleBounds(parameters)
    const mesh = buildDrawerHandleMesh(parameters)
    const zValues = Array.from(mesh.positions).filter((_, index) => index % 3 === 2)

    expect(bounds.bottomZMm).toBeCloseTo(expectedBottom, 6)
    expect(bounds.topZMm).toBeCloseTo(expectedTop, 6)
    expect(Math.min(...zValues)).toBeCloseTo(expectedBottom, 6)
    expect(Math.max(...zValues)).toBeCloseTo(expectedTop, 6)
  })

  it.each([
    { position: 0, expectedBottom: 34, expectedTop: 50 },
    { position: 50, expectedBottom: 17, expectedTop: 33 },
    { position: 100, expectedBottom: 0, expectedTop: 16 },
  ])('positions the complete reinforced opening at $position%', ({ position, expectedBottom, expectedTop }) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed' as const, handlePositionPercent: position }

    const bounds = drawerHandleBounds(parameters)

    expect(bounds.bottomZMm).toBeCloseTo(expectedBottom, 6)
    expect(bounds.topZMm).toBeCloseTo(expectedTop, 6)
    expect(bounds.openingBottomZMm).toBeCloseTo(expectedBottom + parameters.wallThicknessMm, 6)
    expect(bounds.openingTopZMm).toBeCloseTo(expectedTop - parameters.wallThicknessMm, 6)
  })

  it('builds an unbacked through-hole with reinforcing ribs on both front-wall faces', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed' as const, handlePositionPercent: 50 }
    const config: DesignConfig = { ...DEFAULT_DRAWER, parameters, texture: createTextureDefault('smooth') }

    const result = await buildGeometry(config, 'draft')

    expect(result.stats.boundsMm[1]).toBeCloseTo(parameters.depthMm + parameters.wallThicknessMm, 3)
    expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3)
    expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)

    const bounds = drawerHandleBounds(parameters)
    const centerZ = (bounds.openingBottomZMm + bounds.openingTopZMm) / 2
    const frontRibY = -parameters.depthMm / 2 - parameters.wallThicknessMm
    const innerRibY = -parameters.depthMm / 2 + parameters.wallThicknessMm + parameters.handleDepthMm
    const yValues = Array.from(singleMesh(result).positions).filter((_, index) => index % 3 === 1)
    expect(yValues.some((y) => Math.abs(y - frontRibY) < 0.01)).toBe(true)
    expect(yValues.some((y) => Math.abs(y - innerRibY) < 0.01)).toBe(true)

    const centerRayHits = intersectionsAlongY(singleMesh(result).positions, singleMesh(result).indices, 0, centerZ)
    expect(centerRayHits.length).toBeGreaterThan(0)
    expect(Math.min(...centerRayHits)).toBeGreaterThan(0)
  })

  it('creates deterministic square, rounded, and maximum-radius opening contours', () => {
    expect(roundedRectangleContour(50, 12, 0, 4)).toEqual([[-25, -6], [25, -6], [25, 6], [-25, 6]])

    const rounded = roundedRectangleContour(50, 12, 3, 4)
    expect(rounded).toHaveLength(16)
    expect(rounded[0][0]).toBeCloseTo(25, 8)
    expect(rounded[0][1]).toBeCloseTo(3, 8)
    expect(rounded.every(([x, z]) => Math.abs(x) <= 25 && Math.abs(z) <= 6)).toBe(true)

    const maximum = roundedRectangleContour(50, 12, 6, 4)
    expect(maximum).toHaveLength(16)
    expect(maximum[0]).toEqual([25, 0])
  })

  it.each([
    { name: 'square at top', radius: 0, position: 0 },
    { name: 'rounded at center', radius: 3, position: 50 },
    { name: 'maximum radius at bottom', radius: 6, position: 100 },
  ])('builds a connected $name reinforced opening', async ({ radius, position }) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const parameters = {
      ...DEFAULT_DRAWER.parameters,
      handleStyle: 'recessed' as const,
      handleCornerRadiusMm: radius,
      handlePositionPercent: position,
    }

    const result = await buildGeometry({ ...DEFAULT_DRAWER, parameters }, 'draft')

    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
  })

  it.each(['projecting', 'recessed'] as const)('builds a connected textured drawer with a %s handle away from the top edge', async (handleStyle) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const config: DesignConfig = {
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, handleStyle, handlePositionPercent: 75 },
    }

    const result = await buildGeometry(config, 'draft')

    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
  })

  it.each([
    { name: 'front only', walls: { front: true, sides: false, back: false }, textured: ['front'] },
    { name: 'sides only', walls: { front: false, sides: true, back: false }, textured: ['right', 'left'] },
    { name: 'back only', walls: { front: false, sides: false, back: true }, textured: ['back'] },
    { name: 'all walls', walls: { front: true, sides: true, back: true }, textured: ['right', 'back', 'left', 'front'] },
  ] as const)('applies drawer texture to $name', ({ walls, textured }) => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const sideSegments = 8
    const verticalSegments = 8
    const texture = createTextureDefault('noise')
    const mesh = buildDrawerOuterMesh(
      { ...DEFAULT_DRAWER.parameters, edgeTreatment: { style: 'none', sizeMm: 1 } },
      texture,
      walls,
      { circularSegments: 24, drawerSideSegments: sideSegments, verticalSegments },
    )
    const loopSize = sideSegments * 4
    const halfWidth = DEFAULT_DRAWER.parameters.widthMm / 2
    const halfDepth = DEFAULT_DRAWER.parameters.depthMm / 2
    const displacement = { right: 0, back: 0, left: 0, front: 0 }

    for (let ring = 1; ring < verticalSegments; ring += 1) {
      for (let step = 1; step < sideSegments; step += 1) {
        const coordinate = (wall: number, axis: 0 | 1) => mesh.positions[((ring * loopSize) + wall * sideSegments + step) * 3 + axis]
        displacement.right = Math.max(displacement.right, Math.abs(coordinate(0, 0) - halfWidth))
        displacement.back = Math.max(displacement.back, Math.abs(coordinate(1, 1) - halfDepth))
        displacement.left = Math.max(displacement.left, Math.abs(coordinate(2, 0) + halfWidth))
        displacement.front = Math.max(displacement.front, Math.abs(coordinate(3, 1) + halfDepth))
      }
    }

    for (const wall of Object.keys(displacement) as Array<keyof typeof displacement>) {
      if ((textured as readonly string[]).includes(wall)) expect(displacement[wall]).toBeGreaterThan(0.01)
      else expect(displacement[wall]).toBeCloseTo(0, 6)
    }
  })

  it('uses smooth mesh density when every drawer texture wall is disabled', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const textureWalls: DrawerTextureWalls = { front: false, sides: false, back: false }
    const config: DesignConfig = { ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, edgeTreatment: { style: 'none', sizeMm: 1 } }, textureWalls }
    const tessellation = { circularSegments: 24, drawerSideSegments: 8, verticalSegments: 20 }

    const plan = planTessellation(config, 'preview')
    const mesh = buildDrawerOuterMesh(config.parameters, config.texture, textureWalls, tessellation)

    expect(plan.warnings).toEqual([])
    expect(plan.tessellation).toEqual({ circularSegments: 72, verticalSegments: 16, drawerSideSegments: 36, edgeSegments: 5 })
    expect(mesh.positions.length).toBe((2 * tessellation.drawerSideSegments * 4 + 2) * 3)
  })

  it.each(TEXTURE_KINDS)('builds the %s texture on both supported models', async (kind) => {
    const texture = createTextureDefault(kind)
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_POT_WITH_TRAY, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, 'draft')
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(result.parts.every((part) => Array.from(part.mesh.positions).every(Number.isFinite))).toBe(true)
      if (config.type === 'pot-with-tray') expect(result.parts).toHaveLength(2)
    }
  }, 40_000)

  it.each(CELL_TEXTURE_QUALITY_CASES)('builds finite $reliefMode $kind solids within the triangle limit at $quality quality', async ({ kind, quality, reliefMode }) => {
    const texture = { ...createTextureDefault(kind), reliefMode }
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, quality)

      expect(result.stats.volumeMm3).toBeGreaterThan(0)
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
    }
  }, 30_000)

  it.each([-60, 0, 60])('builds finite ribs at %s degrees on both supported models', async (angleDeg) => {
    const base = createTextureDefault('ribs')
    if (base.kind !== 'ribs') throw new Error('Broken texture fixture')
    const texture = { ...base, angleDeg, scaleMm: 12, depthMm: 0.5, bottomOffsetPercent: 20, topOffsetPercent: 20 }
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, 'draft')

      expect(result.stats.volumeMm3).toBeGreaterThan(0)
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
    }
  }, 20_000)

  it.each(['ribs', 'honeycomb', 'voronoi', 'fractal'] as const)('applies vector %s relief in both directions without falling back to the sampled shell', async (kind) => {
    const base = createTextureDefault(kind)
    if (base.kind === 'smooth') throw new Error('Broken texture fixture')
    const texture = base.kind === 'ribs'
      ? { ...base, scaleMm: Math.max(12, base.scaleMm), depthMm: 0.5, bottomOffsetPercent: 20, topOffsetPercent: 20 }
      : { ...base, scaleMm: Math.max(12, base.scaleMm), depthMm: 0.5, bottomOffsetPercent: 20, topOffsetPercent: 20, bottomFadeMm: 0, topFadeMm: 0 }
    const smooth = await buildGeometry({ ...DEFAULT_DRAWER, texture: createTextureDefault('smooth') }, 'draft')

    const embossed = await buildGeometry({ ...DEFAULT_DRAWER, texture: { ...texture, reliefMode: 'emboss' } }, 'draft')
    const recessed = await buildGeometry({ ...DEFAULT_DRAWER, texture: { ...texture, reliefMode: 'recess' } }, 'draft')

    expect(embossed.stats.volumeMm3).toBeGreaterThan(smooth.stats.volumeMm3)
    expect(recessed.stats.volumeMm3).toBeLessThan(smooth.stats.volumeMm3)
  }, 20_000)

  it.each((['draft', 'preview', 'export'] satisfies BuildQuality[]).flatMap((quality) =>
    (['emboss', 'recess'] as const).map((reliefMode) => ({ quality, reliefMode })),
  ))('builds finite $reliefMode fractal solids at $quality quality', async ({ quality, reliefMode }) => {
    const base = createTextureDefault('fractal')
    if (base.kind !== 'fractal') throw new Error('Broken fractal fixture')
    const texture = { ...base, reliefMode, scaleMm: 30, levels: 2, bottomOffsetPercent: 20, topOffsetPercent: 20 }
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, quality)

      expect(result.stats.volumeMm3).toBeGreaterThan(0)
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(Array.from(singleMesh(result).positions).every(Number.isFinite)).toBe(true)
    }
  }, 30_000)

  it('warns when fractal root density is reduced by the vector budget', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const base = createTextureDefault('fractal')
    if (base.kind !== 'fractal') throw new Error('Broken fractal fixture')
    const config: DesignConfig = {
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, widthMm: 400, depthMm: 400, heightMm: 250 },
      texture: { ...base, scaleMm: 20, branchWidthMm: 3, levels: 6 },
    }

    expect(planTessellation(config, 'preview').warnings).toContain('Fractal branch density was reduced to keep the mesh below the export complexity limit.')
  })

  it('keeps sampled noise seeded, deterministic, and seamless', () => {
    const texture = createTextureDefault('noise')
    if (texture.kind !== 'noise') throw new Error('Broken texture fixture')
    const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm }
    expect(textureSignal(texture, potSample)).toBeCloseTo(textureSignal(texture, potSample), 12)
    expect(textureDisplacement(texture, potSample)).toBeCloseTo(textureDisplacement(texture, seam), 8)
    expect(textureSignal({ ...texture, seed: texture.seed + 1 }, potSample)).not.toBeCloseTo(textureSignal(texture, potSample), 12)
  })

  it('refuses to raster-sample geometric vector presets', () => {
    for (const kind of ['ribs', 'honeycomb', 'voronoi', 'fractal'] as const) {
      expect(() => textureDisplacement(createTextureDefault(kind), potSample)).toThrow(/vector paths/)
    }
  })

  it('maps every tapered-pot ring to the same midpoint circumference', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const expectedMidpointDiameter = (DEFAULT_POT.parameters.bottomDiameterMm + DEFAULT_POT.parameters.topDiameterMm) / 2

    expect(potTexturePerimeter(DEFAULT_POT.parameters)).toBeCloseTo(Math.PI * expectedMidpointDiameter, 12)
    expect(potTexturePerimeter(DEFAULT_POT.parameters)).not.toBeCloseTo(Math.PI * DEFAULT_POT.parameters.bottomDiameterMm, 3)
    expect(potTexturePerimeter(DEFAULT_POT.parameters)).not.toBeCloseTo(Math.PI * DEFAULT_POT.parameters.topDiameterMm, 3)
  })

  it('samples 3D noise in world space without opening the cylindrical seam', () => {
    const noise = createTextureDefault('noise')
    if (noise.kind !== 'noise') throw new Error('Broken texture fixture')
    const texture = { ...noise, dimensions: '3d' as const }
    const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm }
    expect(textureDisplacement(texture, seam)).toBeCloseTo(textureDisplacement(texture, potSample), 10)
    expect(textureSignal(texture, { ...potSample, xMm: 0, yMm: 50 })).not.toBeCloseTo(textureSignal(texture, potSample), 10)
  })

  it('uses independent texture offsets and suppresses scalar displacement outside the selected band', () => {
    const texture = createTextureDefault('noise')
    if (texture.kind !== 'noise') throw new Error('Broken texture fixture')
    const asymmetric = { ...texture, bottomOffsetPercent: 20, topOffsetPercent: 60, bottomFadeMm: 0, topFadeMm: 0 }

    expect(textureDisplacement(asymmetric, { ...potSample, zMm: 19.99 })).toBe(0)
    expect(textureDisplacement(asymmetric, { ...potSample, zMm: 40 })).toBe(0)
    expect(textureDisplacement(asymmetric, { ...potSample, zMm: 30 })).not.toBe(0)
    expect(textureDisplacement({ ...asymmetric, bottomOffsetPercent: 60, topOffsetPercent: 40 }, potSample)).toBe(0)
  })

  it('uses a denser export grid than preview and reports a complexity reduction', () => {
    const noise = createTextureDefault('noise')
    if (noise.kind !== 'noise') throw new Error('Broken texture fixture')
    const dense: DesignConfig = { ...DEFAULT_POT, texture: { ...noise, scaleMm: 0.6, depthMm: 0.1, octaves: 1, quality: 'high' } }
    const preview = planTessellation(dense, 'preview')
    const exported = planTessellation(dense, 'export')
    expect(exported.tessellation.circularSegments * exported.tessellation.verticalSegments).toBeGreaterThanOrEqual(preview.tessellation.circularSegments * preview.tessellation.verticalSegments)
    expect(exported.warnings).not.toHaveLength(0)
  })

  it('encodes a valid-length binary STL', async () => {
    const result = await buildGeometry({ ...DEFAULT_POT, texture: createTextureDefault('smooth') }, 'draft')
    const stl = encodeBinaryStl(singleMesh(result))
    expect(stl.byteLength).toBe(84 + result.stats.triangleCount * 50)
    expect(new DataView(stl).getUint32(80, true)).toBe(result.stats.triangleCount)
  })

  it('rejects an unsafe drainage layout that passes basic field ranges', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const dimensions = { ...DEFAULT_POT.parameters, bottomDiameterMm: 30, topDiameterMm: 30 }
    const config: DesignConfig = { ...DEFAULT_POT, parameters: { ...dimensions, drainageHoles: generateDrainageLayout(12, 8, { cavityFloorRadius: cavityFloorRadius(dimensions), wallThicknessMm: dimensions.wallThicknessMm }) } }
    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/Drainage holes cannot fit/)
  })

  it('preserves full height and places drainage inside the floor cavity for a steep inward taper', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const dimensions = { ...DEFAULT_POT.parameters, heightMm: 30, bottomDiameterMm: 300, topDiameterMm: 30, wallThicknessMm: 0.8, bottomThicknessMm: 12, edgeTreatment: { style: 'none' as const, sizeMm: 1 } }
    const floorRadius = cavityFloorRadius(dimensions)
    const parameters = { ...dimensions, rigidityRibs: { ...dimensions.rigidityRibs, enabled: false }, drainageHoles: generateDrainageLayout(2, 2, { cavityFloorRadius: floorRadius, wallThicknessMm: dimensions.wallThicknessMm }) }
    const centers = resolveDrainageHoles(parameters.drainageHoles, { cavityFloorRadius: floorRadius, wallThicknessMm: parameters.wallThicknessMm, bottomThicknessMm: parameters.bottomThicknessMm }).map((hole) => hole.positionMm)
    const result = await buildGeometry({ ...DEFAULT_POT, parameters, texture: createTextureDefault('smooth') }, 'draft')
    expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3)
    for (const [x, y] of centers) expect(Math.hypot(x, y) + 1).toBeLessThan(floorRadius)
  })

  it('cuts manual and countersunk holes while ignoring disabled holes', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const manual: DrainageHole = { position: { x: 0.25, y: 0 }, diameterMm: 6, shape: 'circle', enabled: true }
    const plain = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [manual] } }, 'draft')
    const disabled = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [{ ...manual, enabled: false }] } }, 'draft')
    const countersunk = await buildGeometry({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [{ ...manual, countersink: { diameterMm: 10, depthMm: 1.5 } }] } }, 'draft')

    expect(disabled.stats.volumeMm3).toBeGreaterThan(plain.stats.volumeMm3)
    expect(countersunk.stats.volumeMm3).toBeLessThan(plain.stats.volumeMm3)
  })
})

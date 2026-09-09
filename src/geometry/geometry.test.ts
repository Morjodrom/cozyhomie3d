import { DEFAULT_DRAWER, DEFAULT_POT, TEXTURE_KINDS, createTextureDefault, type DesignConfig } from '../domain/design'
import type { BuildQuality } from '../domain/worker'
import { cavityFloorRadius, generateDrainageLayout, resolveDrainageHoles, type DrainageHole } from '../domain/drainage'
import { describe, expect, it } from 'vitest'
import { buildGeometry, planTessellation } from './build'
import { potTexturePerimeter } from './mesh-builders'
import { encodeBinaryStl } from './stl'
import { textureDisplacement, textureSignal, type SurfaceSample } from './textures'

const potSample: SurfaceSample = { uMm: 0, perimeterMm: 320, zMm: 50, heightMm: 100, xMm: 50, yMm: 0 }

function honeycombFixture(orientation: 'flat' | 'pointy') {
  const texture = createTextureDefault('honeycomb')
  if (texture.kind !== 'honeycomb') throw new Error('Broken honeycomb fixture')
  return { ...texture, seed: 0, scaleMm: 10, spacingMm: 2, orientation }
}

function surfaceSample(uMm: number, zMm: number, perimeterMm: number): SurfaceSample {
  return { uMm, perimeterMm, zMm, heightMm: 100, xMm: 0, yMm: 0 }
}

describe('geometry generation', () => {
  it('builds the default pot as one printable solid with open drainage holes', async () => {
    const result = await buildGeometry(DEFAULT_POT, 'draft')
    expect(result.stats.triangleCount).toBeGreaterThan(100)
    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_POT.parameters.heightMm, 3)
    expect(result.mesh.indices.length).toBe(result.stats.triangleCount * 3)
    expect(Array.from(result.mesh.positions).every(Number.isFinite)).toBe(true)
  })

  it('builds the default drawer with its attached handle projection', async () => {
    const result = await buildGeometry(DEFAULT_DRAWER, 'draft')
    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    expect(result.stats.boundsMm[0]).toBeGreaterThanOrEqual(DEFAULT_DRAWER.parameters.widthMm)
    expect(result.stats.boundsMm[1]).toBeGreaterThan(DEFAULT_DRAWER.parameters.depthMm)
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3)
  })

  it.each(TEXTURE_KINDS)('builds the %s texture on both supported models', async (kind) => {
    const texture = createTextureDefault(kind)
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, 'draft')
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(Array.from(result.mesh.positions).every(Number.isFinite)).toBe(true)
    }
  })

  it.each(['draft', 'preview', 'export'] satisfies BuildQuality[])('builds finite honeycomb solids within the triangle limit at %s quality', async (quality) => {
    const texture = createTextureDefault('honeycomb')
    for (const config of [{ ...DEFAULT_POT, texture }, { ...DEFAULT_DRAWER, texture }] as DesignConfig[]) {
      const result = await buildGeometry(config, quality)

      expect(result.stats.volumeMm3).toBeGreaterThan(0)
      expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
      expect(Array.from(result.mesh.positions).every(Number.isFinite)).toBe(true)
    }
  })

  it.each(['noise', 'honeycomb', 'voronoi'] as const)('is seeded, deterministic, and seamless for %s', (kind) => {
    const texture = createTextureDefault(kind)
    if (texture.kind === 'smooth') throw new Error('Broken texture fixture')
    const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm }
    expect(textureSignal(texture, potSample)).toBeCloseTo(textureSignal(texture, potSample), 12)
    expect(textureDisplacement(texture, potSample)).toBeCloseTo(textureDisplacement(texture, seam), 8)
    expect(textureSignal({ ...texture, seed: texture.seed + 1 }, potSample)).not.toBeCloseTo(textureSignal(texture, potSample), 12)
  })

  it('uses exact pointy hexagon boundaries with a flat cell interior and wall plateau', () => {
    const texture = honeycombFixture('pointy')
    const perimeterMm = 100
    const edgeU = texture.scaleMm / 2
    const cornerZ = texture.scaleMm / (2 * Math.sqrt(3))

    expect(textureSignal(texture, surfaceSample(0, 0, perimeterMm))).toBe(0)
    expect(textureSignal(texture, surfaceSample(edgeU, 0, perimeterMm))).toBe(1)
    expect(textureSignal(texture, surfaceSample(edgeU, cornerZ, perimeterMm))).toBe(1)
    expect(textureSignal(texture, surfaceSample(edgeU - texture.spacingMm * 0.4, 0, perimeterMm))).toBe(1)
    expect(textureSignal(texture, surfaceSample(edgeU - texture.spacingMm * 0.45, 0, perimeterMm))).toBeCloseTo(0.5, 10)
    expect(textureSignal(texture, surfaceSample(edgeU - texture.spacingMm * 0.5, 0, perimeterMm))).toBe(0)
  })

  it('rotates flat honeycombs by thirty degrees instead of shifting their phase', () => {
    const flat = honeycombFixture('flat')
    const pointy = honeycombFixture('pointy')
    const perimeterMm = Math.sqrt(3) * flat.scaleMm * 6

    expect(textureSignal(flat, surfaceSample(0, flat.scaleMm / 2, perimeterMm))).toBe(1)
    expect(textureSignal(flat, surfaceSample(4, 2, perimeterMm))).toBe(1)
    expect(textureSignal(pointy, surfaceSample(4, 2, 100))).toBe(0)
    expect(textureSignal(pointy, surfaceSample(flat.scaleMm / 2, 0, 100))).toBe(1)
  })

  it('uses the seed as a rigid honeycomb translation', () => {
    const unshifted = honeycombFixture('pointy')
    const shifted = { ...unshifted, seed: 17 }
    const perimeterMm = 100
    const radius = unshifted.scaleMm / Math.sqrt(3)
    const offsetU = ((shifted.seed * 0.7548776662466927) % 1) * unshifted.scaleMm
    const offsetZ = ((shifted.seed * 0.5698402909980532) % 1) * radius * 3
    const point = surfaceSample(2.3, 4.7, perimeterMm)

    expect(textureSignal(shifted, point)).toBeCloseTo(textureSignal(unshifted, {
      ...point,
      uMm: point.uMm + offsetU,
      zMm: point.zMm + offsetZ,
    }), 10)
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

  it('uses the centered coverage band and never displaces its structural edges', () => {
    const texture = createTextureDefault('ribs')
    if (texture.kind === 'smooth') throw new Error('Broken texture fixture')
    expect(textureDisplacement(texture, { ...potSample, zMm: 0 })).toBe(0)
    expect(textureDisplacement(texture, { ...potSample, zMm: 100 })).toBe(0)
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
    const stl = encodeBinaryStl(result.mesh)
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
    const dimensions = { ...DEFAULT_POT.parameters, heightMm: 30, bottomDiameterMm: 300, topDiameterMm: 30, wallThicknessMm: 0.8, bottomThicknessMm: 12 }
    const floorRadius = cavityFloorRadius(dimensions)
    const parameters = { ...dimensions, drainageHoles: generateDrainageLayout(2, 2, { cavityFloorRadius: floorRadius, wallThicknessMm: dimensions.wallThicknessMm }) }
    const centers = resolveDrainageHoles(parameters.drainageHoles, { cavityFloorRadius: floorRadius, wallThicknessMm: parameters.wallThicknessMm, bottomThicknessMm: parameters.bottomThicknessMm }).map((hole) => hole.positionMm)
    const result = await buildGeometry({ ...DEFAULT_POT, parameters, texture: createTextureDefault('smooth') }, 'draft')
    expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3)
    for (const [x, y] of centers) expect(Math.hypot(x, y) + 1).toBeLessThan(floorRadius)
  })

  it('rejects a handle that cannot retain its printable underside', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const config: DesignConfig = { ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, heightMm: 20, handleProjectionMm: 20 } }
    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/printable 45-degree angle/)
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

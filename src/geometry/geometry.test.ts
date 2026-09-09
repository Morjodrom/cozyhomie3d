import { DEFAULT_DRAWER, DEFAULT_POT, TEXTURE_KINDS, createTextureDefault, type DesignConfig } from '../domain/design'
import { describe, expect, it } from 'vitest'
import { buildGeometry, drainageCenters, planTessellation } from './build'
import { encodeBinaryStl } from './stl'
import { textureDisplacement, textureSignal, type SurfaceSample } from './textures'

const potSample: SurfaceSample = { uMm: 0, perimeterMm: 320, zMm: 50, heightMm: 100, xMm: 50, yMm: 0 }

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

  it.each(['noise', 'honeycomb', 'voronoi'] as const)('is seeded, deterministic, and seamless for %s', (kind) => {
    const texture = createTextureDefault(kind)
    if (texture.kind === 'smooth') throw new Error('Broken texture fixture')
    const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm }
    expect(textureSignal(texture, potSample)).toBeCloseTo(textureSignal(texture, potSample), 12)
    expect(textureDisplacement(texture, potSample)).toBeCloseTo(textureDisplacement(texture, seam), 8)
    expect(textureSignal({ ...texture, seed: texture.seed + 1 }, potSample)).not.toBeCloseTo(textureSignal(texture, potSample), 12)
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
    const config: DesignConfig = { ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, bottomDiameterMm: 30, topDiameterMm: 30, drainageHoleCount: 12, drainageHoleDiameterMm: 8 } }
    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/Drainage holes cannot fit/)
  })

  it('preserves full height and places drainage inside the floor cavity for a steep inward taper', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const parameters = { ...DEFAULT_POT.parameters, heightMm: 30, bottomDiameterMm: 300, topDiameterMm: 30, wallThicknessMm: 0.8, bottomThicknessMm: 12, drainageHoleCount: 2, drainageHoleDiameterMm: 2 }
    const slope = (parameters.topDiameterMm / 2 - parameters.bottomDiameterMm / 2) / parameters.heightMm
    const cavityFloorRadius = parameters.bottomDiameterMm / 2 + slope * parameters.bottomThicknessMm - parameters.wallThicknessMm
    const centers = drainageCenters(parameters, cavityFloorRadius)
    const result = await buildGeometry({ ...DEFAULT_POT, parameters, texture: createTextureDefault('smooth') }, 'draft')
    expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3)
    for (const [x, y] of centers) expect(Math.hypot(x, y) + parameters.drainageHoleDiameterMm / 2).toBeLessThan(cavityFloorRadius)
  })

  it('rejects a handle that cannot retain its printable underside', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const config: DesignConfig = { ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, heightMm: 20, handleProjectionMm: 20 } }
    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/printable 45-degree angle/)
  })

  it('keeps drainage centers inside the cavity floor', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const centers = drainageCenters(DEFAULT_POT.parameters, 40)
    expect(centers).toHaveLength(DEFAULT_POT.parameters.drainageHoleCount)
  })
})

import { DEFAULT_DRAWER, DEFAULT_POT, type DesignConfig } from '../domain/design'
import { describe, expect, it } from 'vitest'
import { buildGeometry, drainageCenters } from './build'
import { encodeBinaryStl } from './stl'
import { textureDisplacement } from './textures'

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
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const result = await buildGeometry(DEFAULT_DRAWER, 'draft')

    expect(result.stats.volumeMm3).toBeGreaterThan(0)
    expect(result.stats.boundsMm[0]).toBeGreaterThanOrEqual(DEFAULT_DRAWER.parameters.widthMm)
    expect(result.stats.boundsMm[1]).toBeGreaterThan(DEFAULT_DRAWER.parameters.depthMm)
    expect(result.stats.boundsMm[2]).toBeCloseTo(DEFAULT_DRAWER.parameters.heightMm, 3)
  })

  it.each(['smooth', 'ribs', 'twisted'] as const)('supports the %s texture preset', async (kind) => {
    const texture = kind === 'smooth' ? { kind } as const : { kind, amplitudeMm: 1.2, density: 12 } as const
    const config: DesignConfig = { ...DEFAULT_POT, texture }

    const result = await buildGeometry(config, 'draft')

    expect(result.stats.triangleCount).toBeLessThanOrEqual(500_000)
  })

  it('uses deterministic positive-only texture displacement with a continuous seam', () => {
    const texture = { kind: 'twisted', amplitudeMm: 1.2, density: 12 } as const

    const first = textureDisplacement(texture, 0, 0.4)
    const repeated = textureDisplacement(texture, 1, 0.4)

    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThanOrEqual(texture.amplitudeMm)
    expect(repeated).toBeCloseTo(first, 10)
  })

  it('encodes a valid-length binary STL', async () => {
    const result = await buildGeometry({ ...DEFAULT_POT, texture: { kind: 'smooth' } }, 'draft')

    const stl = encodeBinaryStl(result.mesh)

    expect(stl.byteLength).toBe(84 + result.stats.triangleCount * 50)
    expect(new DataView(stl).getUint32(80, true)).toBe(result.stats.triangleCount)
  })

  it('rejects an unsafe drainage layout that passes basic field ranges', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const config: DesignConfig = {
      ...DEFAULT_POT,
      parameters: {
        ...DEFAULT_POT.parameters,
        bottomDiameterMm: 30,
        topDiameterMm: 30,
        wallThicknessMm: 2,
        drainageHoleCount: 12,
        drainageHoleDiameterMm: 8,
      },
    }

    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/Drainage holes cannot fit/)
  })

  it('rejects a handle that cannot retain its printable underside', async () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken drawer fixture')
    const config: DesignConfig = {
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, heightMm: 20, handleProjectionMm: 20 },
    }

    await expect(buildGeometry(config, 'draft')).rejects.toThrow(/printable 45-degree angle/)
  })

  it('preserves full height and places drainage inside the floor cavity for a steep inward taper', async () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const parameters = {
      ...DEFAULT_POT.parameters,
      heightMm: 30,
      bottomDiameterMm: 300,
      topDiameterMm: 30,
      wallThicknessMm: 0.8,
      bottomThicknessMm: 12,
      drainageHoleCount: 2,
      drainageHoleDiameterMm: 2,
    }
    const config: DesignConfig = { ...DEFAULT_POT, parameters, texture: { kind: 'smooth' } }
    const slope = (parameters.topDiameterMm / 2 - parameters.bottomDiameterMm / 2) / parameters.heightMm
    const cavityFloorRadius = parameters.bottomDiameterMm / 2
      + slope * parameters.bottomThicknessMm
      - parameters.wallThicknessMm

    const centers = drainageCenters(parameters, cavityFloorRadius)
    const result = await buildGeometry(config, 'draft')

    expect(result.stats.boundsMm[2]).toBeCloseTo(parameters.heightMm, 3)
    expect(centers).toHaveLength(2)
    for (const [x, y] of centers) {
      expect(Math.hypot(x, y) + parameters.drainageHoleDiameterMm / 2).toBeLessThan(cavityFloorRadius)
    }
  })
})

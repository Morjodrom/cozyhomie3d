import { describe, expect, it } from 'vitest'
import {
  generateCenteredDrainageHole,
  generateRadialDrainageHoles,
  resolveDrainageHoles,
  type DrainageHole,
} from './drainage'

const context = { cavityFloorRadius: 40, wallThicknessMm: 2, bottomThicknessMm: 3 }

describe('drainage layouts', () => {
  it('generates a canonical centered hole', () => {
    expect(generateCenteredDrainageHole(6)).toEqual([{
      position: { x: 0, y: 0 }, diameterMm: 6, shape: 'circle', enabled: true,
    }])
  })

  it('generates deterministic equally spaced normalized radial holes', () => {
    const holes = generateRadialDrainageHoles(4, 6, context)
    const radii = holes.map((hole) => Math.hypot(hole.position.x, hole.position.y))

    expect(holes).toHaveLength(4)
    expect(holes).toEqual(generateRadialDrainageHoles(4, 6, context))
    expect(new Set(radii.map((radius) => radius.toFixed(10)))).toHaveLength(1)
    const angles = holes.map((hole) => Math.atan2(hole.position.y, hole.position.x))
    expect(angles[0]).toBeCloseTo(0, 12)
    expect(angles[1]).toBeCloseTo(Math.PI / 2, 12)
    expect(angles[2]).toBeCloseTo(Math.PI, 12)
    expect(angles[3]).toBeCloseTo(-Math.PI / 2, 12)
  })

  it('resolves manual normalized positions into millimetres', () => {
    const holes: DrainageHole[] = [
      { position: { x: 0.25, y: -0.5 }, diameterMm: 4, shape: 'circle', enabled: true },
    ]

    expect(resolveDrainageHoles(holes, context)[0].positionMm).toEqual([10, -20])
  })

  it('rejects boundary, overlap, and invalid countersink layouts', () => {
    const centered = generateCenteredDrainageHole(6)[0]

    expect(() => resolveDrainageHoles([{ ...centered, position: { x: 0.95, y: 0 } }], context)).toThrow(/cannot fit/)
    expect(() => resolveDrainageHoles([centered, { ...centered }], context)).toThrow(/cannot fit/)
    expect(() => resolveDrainageHoles([{ ...centered, countersink: { diameterMm: 5, depthMm: 1 } }], context)).toThrow(/diameter/)
    expect(() => resolveDrainageHoles([{ ...centered, countersink: { diameterMm: 10, depthMm: 4 } }], context)).toThrow(/depth/)
  })

  it('excludes disabled holes from spatial validation', () => {
    const disabled: DrainageHole = {
      position: { x: 1, y: 0 }, diameterMm: 20, shape: 'circle',
      countersink: { diameterMm: 2, depthMm: 100 }, enabled: false,
    }

    expect(resolveDrainageHoles([disabled], context)).toEqual([])
  })
})

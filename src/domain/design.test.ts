import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY, MIN_REMAINING_WALL_MM, TEXTURE_KINDS,
  createTextureDefault, designConfigSchema, type DesignConfig,
} from './design'

describe('v9 design schemas', () => {
  it('accepts both versioned default designs and every registered texture', () => {
    expect(designConfigSchema.safeParse(DEFAULT_POT).success).toBe(true)
    expect(designConfigSchema.safeParse(DEFAULT_DRAWER).success).toBe(true)
    expect(designConfigSchema.safeParse(DEFAULT_POT_WITH_TRAY).success).toBe(true)
    for (const kind of TEXTURE_KINDS) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: createTextureDefault(kind) }).success).toBe(true)
    }
  })

  it('adds printable tray defaults without changing the inherited pot parameters', () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken pot fixtures')
    expect(DEFAULT_POT_WITH_TRAY.parameters).toEqual(DEFAULT_POT.parameters)
    expect(DEFAULT_POT_WITH_TRAY.tray).toEqual({
      heightMm: 18,
      wallThicknessMm: 2,
      bottomThicknessMm: 3,
      engagementDepthMm: 1.5,
      fitClearanceMm: 0.25,
    })
  })

  it('validates the projected tray, hidden connector, and flush rigidity placement', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const outside = {
      ...DEFAULT_POT_WITH_TRAY,
      parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, rigidityRibs: { ...DEFAULT_POT_WITH_TRAY.parameters.rigidityRibs, placement: 'outside' as const } },
    }
    const shallowFloor = {
      ...DEFAULT_POT_WITH_TRAY,
      parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, bottomThicknessMm: 2 },
      tray: { ...DEFAULT_POT_WITH_TRAY.tray, engagementDepthMm: 1.5 },
    }
    const collapsedProjection = {
      ...DEFAULT_POT_WITH_TRAY,
      parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, heightMm: 30, bottomDiameterMm: 30, topDiameterMm: 350 },
    }
    const connectorCollision = {
      ...DEFAULT_POT_WITH_TRAY,
      parameters: {
        ...DEFAULT_POT_WITH_TRAY.parameters,
        drainageHoles: [{ ...DEFAULT_POT_WITH_TRAY.parameters.drainageHoles[0], position: { x: 0.9, y: 0 } }],
      },
    }

    expect(designConfigSchema.safeParse(outside).success).toBe(false)
    expect(designConfigSchema.safeParse(shallowFloor).success).toBe(false)
    expect(designConfigSchema.safeParse(collapsedProjection).success).toBe(false)
    expect(designConfigSchema.safeParse(connectorCollision).success).toBe(false)
  })

  it('rejects previous designs instead of migrating obsolete texture shapes', () => {
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, schemaVersion: 8 }).success).toBe(false)
  })

  it('uses one angled rib texture with bounded angles and no fade fields', () => {
    const ribs = createTextureDefault('ribs')
    expect(ribs).toMatchObject({ kind: 'ribs', angleDeg: 0 })
    expect(ribs).not.toHaveProperty('bottomFadeMm')
    expect(ribs).not.toHaveProperty('topFadeMm')
    expect(TEXTURE_KINDS).not.toContain('twisted')
    for (const angleDeg of [-60, 0, 60]) expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...ribs, angleDeg } }).success).toBe(true)
    for (const angleDeg of [-60.01, 60.01]) expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...ribs, angleDeg } }).success).toBe(false)
  })

  it('defaults both models to one millimetre rounded edges', () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    expect(DEFAULT_POT.parameters.edgeTreatment).toEqual({ style: 'rounded', sizeMm: 1 })
    expect(DEFAULT_DRAWER.parameters.edgeTreatment).toEqual({ style: 'rounded', sizeMm: 1 })
    expect(DEFAULT_POT.parameters.drainageHoleRounding).toEqual({ enabled: false, radiusMm: 1 })
  })

  it('treats structural edge sizes as bounded maximums while validating drainage rounding independently', () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    for (const style of ['rounded', 'chamfered'] as const) {
      for (const config of [DEFAULT_POT, DEFAULT_POT_WITH_TRAY, DEFAULT_DRAWER] as DesignConfig[]) {
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 20 } } }).success).toBe(true)
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 20.01 } } }).success).toBe(false)
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 0 } } }).success).toBe(false)
      }
    }
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoleRounding: { enabled: true, radiusMm: 1 } } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoleRounding: { enabled: true, radiusMm: 2 } } }).success).toBe(false)
  })

  it('defaults both models to enabled stress-relief ribs', () => {
    expect(DEFAULT_POT.parameters.bottomRibs).toEqual({ enabled: true, pattern: 'concentric', count: 3, depthMm: 2, widthMm: 3 })
    expect(DEFAULT_DRAWER.parameters.bottomRibs).toEqual({ enabled: true, pattern: 'grid', xCount: 5, yCount: 5, depthMm: 2, widthMm: 3 })
    expect(DEFAULT_DRAWER.parameters.bottomThicknessMm).toBe(3)
  })

  it('uses separate enabled rigidity-rib defaults and validates printable profiles', () => {
    if (DEFAULT_POT.type !== 'pot' || DEFAULT_DRAWER.type !== 'drawer') throw new Error('Broken default fixtures')
    expect(DEFAULT_POT.parameters.rigidityRibs).toEqual({ enabled: true, placement: 'inside', pattern: 'hoops', projectionMm: 2, baseWidthMm: 4, wallBottomGussetMm: 3, count: 2 })
    expect(DEFAULT_DRAWER.parameters.rigidityRibs).toEqual({ enabled: true, placement: 'inside', pattern: 'vertical', projectionMm: 2, baseWidthMm: 4, wallBottomGussetMm: 3, frontBackCount: 3, sideCount: 2 })
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs, baseWidthMm: 3.99 } } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, rigidityRibs: { ...DEFAULT_DRAWER.parameters.rigidityRibs, enabled: false, frontBackCount: 0, sideCount: 0 } } }).success).toBe(true)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, widthMm: 30, depthMm: 30, rigidityRibs: { ...DEFAULT_DRAWER.parameters.rigidityRibs, wallBottomGussetMm: 14 } },
    }).success).toBe(false)
  })

  it('supports independent drawer rib directions while rejecting an empty enabled grid', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture')
    const ribs = DEFAULT_DRAWER.parameters.bottomRibs
    expect(designConfigSchema.safeParse({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, xCount: 0 } },
    }).success).toBe(true)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, yCount: 0 } },
    }).success).toBe(true)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, xCount: 0, yCount: 0 } },
    }).success).toBe(false)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_DRAWER,
      parameters: { ...DEFAULT_DRAWER.parameters, bottomRibs: { ...ribs, enabled: false, xCount: 0, yCount: 0 } },
    }).success).toBe(true)
  })

  it('protects remaining floor thickness and land between bottom ribs', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Expected pot fixture')
    const ribs = DEFAULT_POT.parameters.bottomRibs
    expect(designConfigSchema.safeParse({
      ...DEFAULT_POT,
      parameters: { ...DEFAULT_POT.parameters, bottomRibs: { ...ribs, depthMm: 2.21 } },
    }).success).toBe(false)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_POT,
      parameters: { ...DEFAULT_POT.parameters, bottomDiameterMm: 30, bottomRibs: { ...ribs, count: 4, widthMm: 3 } },
    }).success).toBe(false)
  })

  it('defaults drawers to texturing every wall group and requires the complete selection', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture')
    expect(DEFAULT_DRAWER.textureWalls).toEqual({ front: true, sides: true, back: true })
    const { back: _back, ...incomplete } = DEFAULT_DRAWER.textureWalls
    expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, textureWalls: incomplete }).success).toBe(false)
  })

  it('validates canonical drainage hole definitions', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Expected pot fixture')
    const first = DEFAULT_POT.parameters.drainageHoles[0]
    expect(first).toMatchObject({ shape: 'circle', enabled: true })
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [{ ...first, position: { x: 1, y: 1 } }] } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [{ ...first, shape: 'slot' }] } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: Array.from({ length: 13 }, () => first) } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: [{ ...first, countersink: { diameterMm: 10, depthMm: 1 } }] } }).success).toBe(true)
  })

  it('rejects a pot without room for its cavity', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Expected pot fixture')
    const parameters = { ...DEFAULT_POT.parameters, wallThicknessMm: 60 }
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters }).success).toBe(false)
  })

  it('keeps a recessed texture above the remaining-wall baseline', () => {
    const texture = createTextureDefault('noise')
    const invalid = { ...DEFAULT_POT, texture: { ...texture, reliefMode: 'recess' as const, depthMm: DEFAULT_POT.parameters.wallThicknessMm - MIN_REMAINING_WALL_MM + 0.01 } }
    expect(designConfigSchema.safeParse(invalid).success).toBe(false)
  })

  it('creates valid unversioned defaults for every texture', () => {
    for (const kind of TEXTURE_KINDS) {
      const texture = createTextureDefault(kind)
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture }).success).toBe(true)
      expect(texture).not.toHaveProperty('textureVersion')
    }
  })

  it('enforces physical feature widths while allowing shallow relief', () => {
    const ribs = createTextureDefault('ribs')
    if (ribs.kind === 'smooth') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...ribs, depthMm: 0.1 } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...ribs, depthMm: ribs.scaleMm / 3 + 0.01 } }).success).toBe(false)

    const noise = createTextureDefault('noise')
    if (noise.kind !== 'noise') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...noise, scaleMm: 1, octaves: 2 } }).success).toBe(false)

    const honeycomb = createTextureDefault('honeycomb')
    if (honeycomb.kind !== 'honeycomb') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...honeycomb, scaleMm: 1.1, spacingMm: 0.6 } }).success).toBe(false)
  })

  it('rejects a drawer handle wider than its safe mounting area', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, handleWidthMm: 119 } }).success).toBe(false)
  })

  it('accepts both drawer handle styles and validates their physical envelope', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture')
    expect(designConfigSchema.safeParse(DEFAULT_DRAWER).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed' } }).success).toBe(true)

    const invalidParameters = [
      { handlePositionPercent: -1 },
      { handlePositionPercent: 101 },
      { handleHeightMm: 51 },
      { handleHeightMm: 10, handleDepthMm: 11 },
      { handleCornerRadiusMm: -0.01 },
      { handleStyle: 'recessed' as const, handleHeightMm: 47 },
      { handleStyle: 'recessed' as const, depthMm: 30, handleDepthMm: 25 },
      { handleStyle: 'recessed' as const, handleCornerRadiusMm: 6.01 },
    ]
    for (const overrides of invalidParameters) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters: { ...DEFAULT_DRAWER.parameters, ...overrides } }).success).toBe(false)
    }
  })

  it('allows square through fully rounded reinforced openings', () => {
    if (DEFAULT_DRAWER.type !== 'drawer') throw new Error('Expected drawer fixture')
    expect(DEFAULT_DRAWER.parameters.handleCornerRadiusMm).toBe(3)
    for (const handleCornerRadiusMm of [0, DEFAULT_DRAWER.parameters.handleHeightMm / 2]) {
      const parameters = { ...DEFAULT_DRAWER.parameters, handleStyle: 'recessed' as const, handleCornerRadiusMm }
      expect(designConfigSchema.safeParse({ ...DEFAULT_DRAWER, parameters }).success).toBe(true)
    }
  })
})

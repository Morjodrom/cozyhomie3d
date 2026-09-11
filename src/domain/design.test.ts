import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY, MIN_REMAINING_WALL_MM, TEXTURE_KINDS,
  createTextureDefault, designConfigSchema, drawerBottomRibsSchema, drawerParametersSchema, drawerRigidityRibsSchema,
  potBottomRibsSchema, potParametersSchema, potRigidityRibsSchema, textureSchema, trayParametersSchema, type DesignConfig,
} from './design'
import { drainageHoleSchema, drainageHolesSchema } from './drainage'

const potDefault = DEFAULT_POT as Extract<DesignConfig, { type: 'pot' }>
const trayDefault = DEFAULT_POT_WITH_TRAY as Extract<DesignConfig, { type: 'pot-with-tray' }>

describe('design schemas', () => {
  it('accepts every current default design and registered texture', () => {
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
      engagementWidthMm: 2,
      engagementDepthMm: 1.5,
      fitClearanceMm: 0.25,
      previewGapMm: 12,
    })
  })

  it('validates independent tray engagement width and thick tray walls', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    const sturdy = {
      ...DEFAULT_POT_WITH_TRAY,
      parameters: { ...DEFAULT_POT_WITH_TRAY.parameters, bottomThicknessMm: 6 },
      tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 10, engagementWidthMm: 5, engagementDepthMm: 5 },
    }

    expect(designConfigSchema.safeParse(sturdy).success).toBe(true)
    for (const engagementWidthMm of [1.19, 25.01]) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, engagementWidthMm } }).success).toBe(false)
    }
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 20 } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 20.01 } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, wallThicknessMm: 2, engagementWidthMm: 2.01 } }).success).toBe(false)
    const { engagementWidthMm: _engagementWidthMm, ...trayWithoutEngagementWidth } = DEFAULT_POT_WITH_TRAY.tray
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: trayWithoutEngagementWidth }).success).toBe(false)
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

  it('requires a bounded preview-only tray gap', () => {
    if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 0 } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 500 } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: -0.01 } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: { ...DEFAULT_POT_WITH_TRAY.tray, previewGapMm: 500.01 } }).success).toBe(false)
    const { previewGapMm: _previewGapMm, ...trayWithoutPreviewGap } = DEFAULT_POT_WITH_TRAY.tray
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT_WITH_TRAY, tray: trayWithoutPreviewGap }).success).toBe(false)
  })

  it('rejects unknown fields throughout the design contract', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken pot fixture')
    const firstHole = DEFAULT_POT.parameters.drainageHoles[0]

    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, unknownField: true }).success).toBe(false)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_POT,
      parameters: { ...DEFAULT_POT.parameters, unknownField: true },
    }).success).toBe(false)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_POT,
      texture: { ...DEFAULT_POT.texture, unknownField: true },
    }).success).toBe(false)
    expect(designConfigSchema.safeParse({
      ...DEFAULT_POT,
      parameters: {
        ...DEFAULT_POT.parameters,
        drainageHoles: [{ ...firstHole, position: { ...firstHole.position, unknownField: true } }],
      },
    }).success).toBe(false)
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

  it('uses independent top and bottom texture offsets without legacy coverage', () => {
    for (const kind of TEXTURE_KINDS.filter((candidate) => candidate !== 'smooth')) {
      const texture = createTextureDefault(kind)
      if (texture.kind === 'smooth') throw new Error('Broken texture fixture')
      expect(texture).toMatchObject({ bottomOffsetPercent: 9, topOffsetPercent: 9 })
      expect(texture).not.toHaveProperty('coveragePercent')
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...texture, bottomOffsetPercent: 0, topOffsetPercent: 100 } }).success).toBe(true)
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...texture, bottomOffsetPercent: 70, topOffsetPercent: 70 } }).success).toBe(true)
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...texture, bottomOffsetPercent: -0.01 } }).success).toBe(false)
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...texture, topOffsetPercent: 100.01 } }).success).toBe(false)
    }
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
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 100 } } }).success).toBe(true)
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 100.01 } } }).success).toBe(false)
        expect(designConfigSchema.safeParse({ ...config, parameters: { ...config.parameters, edgeTreatment: { style, sizeMm: 0 } } }).success).toBe(false)
      }
    }
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoleRounding: { enabled: true, radiusMm: 1 } } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoleRounding: { enabled: false, radiusMm: 25 } } }).success).toBe(true)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoleRounding: { enabled: false, radiusMm: 25.01 } } }).success).toBe(false)
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

  it('validates evenly spaced pot hoops against the neighboring-rib land', () => {
    if (DEFAULT_POT.type !== 'pot') throw new Error('Broken default fixture')
    const ribs = DEFAULT_POT.parameters.rigidityRibs
    const accepted = {
      ...DEFAULT_POT,
      parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...ribs, count: 19 } },
    }
    const rejected = {
      ...DEFAULT_POT,
      parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...ribs, count: 20 } },
    }

    expect(designConfigSchema.safeParse(accepted).success).toBe(true)
    expect(designConfigSchema.safeParse(rejected).success).toBe(false)
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
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters: { ...DEFAULT_POT.parameters, drainageHoles: Array.from({ length: 25 }, () => first) } }).success).toBe(false)
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

  it('creates valid defaults for every texture', () => {
    for (const kind of TEXTURE_KINDS) {
      const texture = createTextureDefault(kind)
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture }).success).toBe(true)
    }
  })

  it('allows overlapping rib strokes down to the minimum feature size while retaining non-rib depth limits', () => {
    const ribs = createTextureDefault('ribs')
    if (ribs.kind !== 'ribs') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...ribs, depthMm: 0.1 } }).success).toBe(true)
    expect(textureSchema.safeParse({ ...ribs, scaleMm: 0.6 }).success).toBe(true)
    expect(textureSchema.safeParse({ ...ribs, scaleMm: 0.59 }).success).toBe(false)

    const voronoi = createTextureDefault('voronoi')
    if (voronoi.kind !== 'voronoi') throw new Error('Broken texture fixture')
    expect(textureSchema.safeParse({ ...voronoi, scaleMm: 3, depthMm: 1.01 }).success).toBe(false)

    const noise = createTextureDefault('noise')
    if (noise.kind !== 'noise') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...noise, scaleMm: 1, octaves: 2 } }).success).toBe(false)

    const honeycomb = createTextureDefault('honeycomb')
    if (honeycomb.kind !== 'honeycomb') throw new Error('Broken texture fixture')
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...honeycomb, scaleMm: 1.1, spacingMm: 0.6 } }).success).toBe(false)
  })

  it('bounds finite fractal recursion and its smallest printable branches', () => {
    const fractal = createTextureDefault('fractal')
    if (fractal.kind !== 'fractal') throw new Error('Broken fractal fixture')
    expect(fractal).toMatchObject({ levels: 4, branchAngleDeg: 32, branchWidthMm: 2, scaleMm: 18 })

    for (const levels of [1, 9]) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...fractal, levels } }).success).toBe(false)
    }
    for (const branchAngleDeg of [9.99, 70.01]) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...fractal, branchAngleDeg } }).success).toBe(false)
    }
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...fractal, scaleMm: 1, depthMm: 0.1, levels: 3 } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...fractal, branchWidthMm: 0.8, levels: 3 } }).success).toBe(false)
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: { ...fractal, scaleMm: 20, branchWidthMm: 3, levels: 6 } }).success).toBe(true)
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

  it.each([
    {
      name: 'principal pot dimensions and thicknesses',
      accepts: () => potParametersSchema.safeParse({
        ...DEFAULT_POT.parameters, heightMm: 1000, bottomDiameterMm: 1000, topDiameterMm: 1000,
        wallThicknessMm: 20, bottomThicknessMm: 30, drainageHoleRounding: { enabled: false, radiusMm: 25 },
      }).success,
      rejects: () => potParametersSchema.safeParse({ ...DEFAULT_POT.parameters, heightMm: 1000.01 }).success,
    },
    {
      name: 'drawer dimensions, thicknesses, and handle depth',
      accepts: () => drawerParametersSchema.safeParse({
        ...DEFAULT_DRAWER.parameters, widthMm: 1000, depthMm: 1000, heightMm: 1000,
        wallThicknessMm: 20, bottomThicknessMm: 30, handleHeightMm: 100, handleDepthMm: 100,
      }).success,
      rejects: () => drawerParametersSchema.safeParse({ ...DEFAULT_DRAWER.parameters, handleDepthMm: 100.01 }).success,
    },
    {
      name: 'tray dimensions and clearance',
      accepts: () => trayParametersSchema.safeParse({
        ...trayDefault.tray, heightMm: 1000, wallThicknessMm: 20, bottomThicknessMm: 30,
        engagementWidthMm: 20, engagementDepthMm: 25, fitClearanceMm: 2, previewGapMm: 500,
      }).success,
      rejects: () => trayParametersSchema.safeParse({ ...trayDefault.tray, fitClearanceMm: 2.01 }).success,
    },
    {
      name: 'bottom groove dimensions and counts',
      accepts: () => potBottomRibsSchema.safeParse({ ...DEFAULT_POT.parameters.bottomRibs, widthMm: 50, depthMm: 20, count: 100 }).success,
      rejects: () => drawerBottomRibsSchema.safeParse({ ...DEFAULT_DRAWER.parameters.bottomRibs, xCount: 101 }).success,
    },
    {
      name: 'rigidity counts without widening their dimensional bounds',
      accepts: () => drawerRigidityRibsSchema.safeParse({ ...DEFAULT_DRAWER.parameters.rigidityRibs, frontBackCount: 60, sideCount: 60 }).success,
      rejects: () => potRigidityRibsSchema.safeParse({ ...DEFAULT_POT.parameters.rigidityRibs, count: 61 }).success,
    },
    {
      name: 'full unsigned texture seed and expanded noise limits',
      accepts: () => textureSchema.safeParse({ ...createTextureDefault('noise'), seed: 0xffffffff, scaleMm: 250, depthMm: 20, bottomFadeMm: 500, topFadeMm: 500, octaves: 8, persistence: 1 }).success,
      rejects: () => textureSchema.safeParse({ ...createTextureDefault('noise'), seed: 0x1_0000_0000 }).success,
    },
    {
      name: 'expanded vector texture limits',
      accepts: () => textureSchema.safeParse({ ...createTextureDefault('honeycomb'), scaleMm: 250, spacingMm: 249, depthMm: 20, bottomFadeMm: 500, topFadeMm: 500 }).success,
      rejects: () => textureSchema.safeParse({ ...createTextureDefault('voronoi'), edgeWidthMm: 50.01 }).success,
    },
    {
      name: 'expanded fractal limits',
      accepts: () => textureSchema.safeParse({ ...createTextureDefault('fractal'), scaleMm: 250, depthMm: 20, bottomFadeMm: 500, topFadeMm: 500, levels: 8, branchWidthMm: 50 }).success,
      rejects: () => textureSchema.safeParse({ ...createTextureDefault('fractal'), levels: 9 }).success,
    },
    {
      name: 'edge treatment size',
      accepts: () => potParametersSchema.safeParse({ ...DEFAULT_POT.parameters, edgeTreatment: { style: 'rounded', sizeMm: 100 } }).success,
      rejects: () => drawerParametersSchema.safeParse({ ...DEFAULT_DRAWER.parameters, edgeTreatment: { style: 'chamfered', sizeMm: 100.01 } }).success,
    },
    {
      name: 'drainage diameter and count',
      accepts: () => drainageHoleSchema.safeParse({ ...potDefault.parameters.drainageHoles[0], diameterMm: 50 }).success && drainageHolesSchema.safeParse(Array.from({ length: 24 }, () => potDefault.parameters.drainageHoles[0])).success,
      rejects: () => drainageHoleSchema.safeParse({ ...potDefault.parameters.drainageHoles[0], diameterMm: 50.01 }).success || drainageHolesSchema.safeParse(Array.from({ length: 25 }, () => potDefault.parameters.drainageHoles[0])).success,
    },
  ])('loosens the approved cap for $name while retaining the next-value rejection', ({ accepts, rejects }) => {
    expect(accepts()).toBe(true)
    expect(rejects()).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAWER, DEFAULT_POT, MIN_REMAINING_WALL_MM, TEXTURE_KINDS,
  createTextureDefault, designConfigSchema, textureSupportsModel,
} from './design'

describe('v2 design schemas', () => {
  it('accepts both versioned default designs and every registered texture', () => {
    expect(designConfigSchema.safeParse(DEFAULT_POT).success).toBe(true)
    expect(designConfigSchema.safeParse(DEFAULT_DRAWER).success).toBe(true)
    for (const kind of TEXTURE_KINDS) {
      expect(designConfigSchema.safeParse({ ...DEFAULT_POT, texture: createTextureDefault(kind) }).success).toBe(true)
    }
  })

  it('rejects v1 designs instead of silently migrating their ambiguous texture fields', () => {
    expect(designConfigSchema.safeParse({ ...DEFAULT_POT, schemaVersion: 1 }).success).toBe(false)
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

  it('declares model support in the texture registry for UI filtering', () => {
    for (const kind of TEXTURE_KINDS) {
      expect(textureSupportsModel(kind, 'pot')).toBe(true)
      expect(textureSupportsModel(kind, 'drawer')).toBe(true)
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
})

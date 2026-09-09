import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAWER, DEFAULT_POT, designConfigSchema } from './design'

describe('design schemas', () => {
  it('accepts both default designs', () => {
    expect(designConfigSchema.safeParse(DEFAULT_POT).success).toBe(true)
    expect(designConfigSchema.safeParse(DEFAULT_DRAWER).success).toBe(true)
  })

  it('rejects a pot without room for its cavity', () => {
    const config = structuredClone(DEFAULT_POT)
    config.parameters.wallThicknessMm = 60

    expect(designConfigSchema.safeParse(config).success).toBe(false)
  })

  it('rejects a drawer handle wider than its safe mounting area', () => {
    const config = structuredClone(DEFAULT_DRAWER)
    if (config.type !== 'drawer') throw new Error('Expected drawer fixture')
    config.parameters.handleWidthMm = 119

    expect(designConfigSchema.safeParse(config).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAWER, DEFAULT_POT, DEFAULT_POT_WITH_TRAY, createTextureDefault, type DesignConfig } from '../domain/design'
import { assertBooleanOperandBudget, estimateBooleanOperands, MAX_BOOLEAN_OPERANDS } from './preflight'

const drawerDefault = DEFAULT_DRAWER as Extract<DesignConfig, { type: 'drawer' }>

function withSmoothTexture(config: DesignConfig): DesignConfig {
  return { ...config, texture: { kind: 'smooth' } }
}

function boundaryDrawer(xCount: number, texture: DesignConfig['texture']): Extract<DesignConfig, { type: 'drawer' }> {
  return {
    ...drawerDefault,
    texture,
    parameters: {
      ...drawerDefault.parameters,
      widthMm: 1000,
      depthMm: 1000,
      heightMm: 1000,
      bottomRibs: { ...drawerDefault.parameters.bottomRibs, xCount, yCount: 100 },
      rigidityRibs: { ...drawerDefault.parameters.rigidityRibs, frontBackCount: 25, sideCount: 0 },
    },
  }
}

describe('boolean operand preflight', () => {
  it.each([DEFAULT_POT, DEFAULT_POT_WITH_TRAY, DEFAULT_DRAWER] as DesignConfig[])(
    'counts a vector texture as one pre-unioned operand for $type',
    (config) => {
      const textured = { ...config, texture: createTextureDefault('ribs') } as DesignConfig

      expect(estimateBooleanOperands(textured)).toBe(estimateBooleanOperands(withSmoothTexture(textured)) + 1)
    },
  )

  it('accepts exactly 256 operands, including a vector-texture operand', () => {
    const config = boundaryDrawer(99, createTextureDefault('ribs'))

    expect(estimateBooleanOperands(config)).toBe(MAX_BOOLEAN_OPERANDS)
    expect(() => assertBooleanOperandBudget(config)).not.toThrow()
  })

  it('rejects 257 operands with an actionable error', () => {
    const config = boundaryDrawer(100, createTextureDefault('ribs'))

    expect(estimateBooleanOperands(config)).toBe(MAX_BOOLEAN_OPERANDS + 1)
    expect(() => assertBooleanOperandBudget(config)).toThrow(/257 generated boolean operands.*reduce feature complexity.*256-operand limit/i)
  })
})

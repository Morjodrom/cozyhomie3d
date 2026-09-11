import type { DesignConfig } from '../domain/design'

export const MAX_BOOLEAN_OPERANDS = 256

function hasVectorTexture(config: DesignConfig): boolean {
  if (config.texture.kind === 'smooth' || config.texture.kind === 'noise') return false
  return config.type !== 'drawer' || Object.values(config.textureWalls).some(Boolean)
}

function potOperands(config: Extract<DesignConfig, { type: 'pot' | 'pot-with-tray' }>): number {
  const { parameters } = config
  const holes = parameters.drainageHoles.filter((hole) => hole.enabled)
  const holeCutters = holes.length + holes.filter((hole) => hole.countersink).length
  const grooveCutters = parameters.bottomRibs.enabled ? parameters.bottomRibs.count : 0
  const rigidity = parameters.rigidityRibs.enabled ? parameters.rigidityRibs.count + 1 : 0
  const vectorTexture = Number(hasVectorTexture(config))

  if (config.type === 'pot') return 1 + holeCutters + grooveCutters + rigidity + vectorTexture

  // Pot cavity, drainage and grooves, connector groove, rigidity, tray cavity,
  // tongue and shoulder, plus the pre-unioned vector-texture operand.
  return 1 + holeCutters + grooveCutters + 1 + rigidity + 3 + vectorTexture
}

/**
 * Estimates the combined boolean workload after vector strokes are unioned in
 * batches of at most MAX_BOOLEAN_OPERANDS and represented as one texture input.
 */
export function estimateBooleanOperands(config: DesignConfig): number {
  if (config.type !== 'drawer') return potOperands(config)

  const { parameters } = config
  const grooveCutters = parameters.bottomRibs.enabled
    ? parameters.bottomRibs.xCount + parameters.bottomRibs.yCount
    : 0
  const rigidity = parameters.rigidityRibs.enabled
    ? parameters.rigidityRibs.frontBackCount * 2 + parameters.rigidityRibs.sideCount * 2 + 4
    : 0
  const handle = parameters.handleStyle === 'projecting' ? 1 : 2
  return 1 + grooveCutters + rigidity + handle + Number(hasVectorTexture(config))
}

export function assertBooleanOperandBudget(config: DesignConfig): void {
  const operands = estimateBooleanOperands(config)
  if (operands > MAX_BOOLEAN_OPERANDS) {
    throw new Error(`Model requires ${operands} generated boolean operands; reduce feature complexity to stay within the ${MAX_BOOLEAN_OPERANDS}-operand limit.`)
  }
}

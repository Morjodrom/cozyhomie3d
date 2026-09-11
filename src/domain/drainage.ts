import { z } from 'zod'

const normalizedPositionSchema = z
  .strictObject({
    x: z.number().min(-1).max(1),
    y: z.number().min(-1).max(1),
  })
  .refine(({ x, y }) => Math.hypot(x, y) <= 1, 'Drainage hole position must be inside the normalized cavity.')

export const drainageHoleSchema = z.strictObject({
  position: normalizedPositionSchema,
  diameterMm: z.number().min(2).max(20),
  shape: z.literal('circle'),
  countersink: z.strictObject({
    diameterMm: z.number().positive(),
    depthMm: z.number().positive(),
  }).optional(),
  enabled: z.boolean(),
})

export const drainageHolesSchema = z.array(drainageHoleSchema).min(1).max(12)

export type DrainageHole = z.infer<typeof drainageHoleSchema>

export type DrainageLayoutContext = {
  cavityFloorRadius: number
  wallThicknessMm: number
  bottomThicknessMm: number
}

export type PotFloorDimensions = {
  heightMm: number
  bottomDiameterMm: number
  topDiameterMm: number
  wallThicknessMm: number
  bottomThicknessMm: number
}

export type ResolvedDrainageHole = DrainageHole & {
  positionMm: readonly [number, number]
  openingRadiusMm: number
}

const CLEARANCE_MM = 0.5

export function cavityFloorRadius(dimensions: PotFloorDimensions): number {
  const bottomRadius = dimensions.bottomDiameterMm / 2
  const topRadius = dimensions.topDiameterMm / 2
  const radiusSlope = (topRadius - bottomRadius) / dimensions.heightMm
  return bottomRadius + radiusSlope * dimensions.bottomThicknessMm - dimensions.wallThicknessMm
}

function generatedHole(position: DrainageHole['position'], diameterMm: number): DrainageHole {
  return { position, diameterMm, shape: 'circle', enabled: true }
}

export function generateCenteredDrainageHole(diameterMm: number): DrainageHole[] {
  return [generatedHole({ x: 0, y: 0 }, diameterMm)]
}

export function generateRadialDrainageHoles(
  count: number,
  diameterMm: number,
  context: Pick<DrainageLayoutContext, 'cavityFloorRadius' | 'wallThicknessMm'>,
): DrainageHole[] {
  if (count === 1) return generateCenteredDrainageHole(diameterMm)
  if (!Number.isInteger(count) || count < 2 || count > 12) {
    throw new Error('Drainage hole count must be an integer between 1 and 12.')
  }

  const holeRadius = diameterMm / 2
  const structuralMargin = Math.max(2, context.wallThicknessMm)
  const maximumRingRadius = Math.max(0, context.cavityFloorRadius - holeRadius - structuralMargin)
  const minimumRingRadius = holeRadius / Math.sin(Math.PI / count) + CLEARANCE_MM
  const preferredRingRadius = context.cavityFloorRadius * 0.55
  const ringRadius = maximumRingRadius < minimumRingRadius
    ? Math.min(maximumRingRadius, preferredRingRadius)
    : Math.min(maximumRingRadius, Math.max(minimumRingRadius, preferredRingRadius))
  const normalizedRadius = context.cavityFloorRadius > 0
    ? Math.min(1, Math.max(0, ringRadius / context.cavityFloorRadius))
    : 0

  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2
    return generatedHole({ x: normalizedRadius * Math.cos(angle), y: normalizedRadius * Math.sin(angle) }, diameterMm)
  })
}

export function generateDrainageLayout(
  count: number,
  diameterMm: number,
  context: Pick<DrainageLayoutContext, 'cavityFloorRadius' | 'wallThicknessMm'>,
): DrainageHole[] {
  return count === 1
    ? generateCenteredDrainageHole(diameterMm)
    : generateRadialDrainageHoles(count, diameterMm, context)
}

export function resolveDrainageHoles(holes: DrainageHole[], context: DrainageLayoutContext): ResolvedDrainageHole[] {
  const structuralMargin = Math.max(2, context.wallThicknessMm)
  const resolved = holes.filter((hole) => hole.enabled).map((hole) => {
    if (hole.countersink && hole.countersink.diameterMm < hole.diameterMm) {
      throw new Error('Countersink diameter cannot be smaller than the drainage hole diameter.')
    }
    if (hole.countersink && hole.countersink.depthMm > context.bottomThicknessMm) {
      throw new Error('Countersink depth cannot exceed the pot bottom thickness.')
    }

    const openingRadiusMm = Math.max(hole.diameterMm, hole.countersink?.diameterMm ?? 0) / 2
    const positionMm = [
      hole.position.x * context.cavityFloorRadius,
      hole.position.y * context.cavityFloorRadius,
    ] as const
    if (Math.hypot(...positionMm) + openingRadiusMm + structuralMargin > context.cavityFloorRadius) {
      throw new Error('Drainage holes cannot fit without overlapping or weakening the base wall.')
    }
    return { ...hole, positionMm, openingRadiusMm }
  })

  for (let first = 0; first < resolved.length; first += 1) {
    for (let second = first + 1; second < resolved.length; second += 1) {
      const dx = resolved[first].positionMm[0] - resolved[second].positionMm[0]
      const dy = resolved[first].positionMm[1] - resolved[second].positionMm[1]
      const minimumDistance = resolved[first].openingRadiusMm + resolved[second].openingRadiusMm + CLEARANCE_MM
      if (Math.hypot(dx, dy) < minimumDistance) {
        throw new Error('Drainage holes cannot fit without overlapping or weakening the base wall.')
      }
    }
  }

  return resolved
}

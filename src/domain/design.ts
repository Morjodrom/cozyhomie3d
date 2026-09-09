import { z } from 'zod'

export const textureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('smooth') }),
  z.object({
    kind: z.enum(['ribs', 'twisted']),
    amplitudeMm: z.number().min(0.2).max(3),
    density: z.number().int().min(4).max(48),
  }),
])

export type TextureConfig = z.infer<typeof textureSchema>

export const potParametersSchema = z
  .object({
    heightMm: z.number().min(30).max(300),
    bottomDiameterMm: z.number().min(30).max(300),
    topDiameterMm: z.number().min(30).max(350),
    wallThicknessMm: z.number().min(0.8).max(8),
    bottomThicknessMm: z.number().min(0.8).max(12),
    drainageHoleCount: z.number().int().min(1).max(12),
    drainageHoleDiameterMm: z.number().min(2).max(20),
  })
  .superRefine((value, context) => {
    const minRadius = Math.min(value.bottomDiameterMm, value.topDiameterMm) / 2
    if (value.wallThicknessMm >= minRadius) {
      context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable cavity.' })
    }
    if (value.bottomThicknessMm >= value.heightMm) {
      context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the pot height.' })
    }
    if (value.drainageHoleDiameterMm / 2 + Math.max(2, value.wallThicknessMm) >= minRadius - value.wallThicknessMm) {
      context.addIssue({ code: 'custom', path: ['drainageHoleDiameterMm'], message: 'Drainage holes are too large for the base.' })
    }
  })

export const drawerParametersSchema = z
  .object({
    widthMm: z.number().min(30).max(400),
    depthMm: z.number().min(30).max(400),
    heightMm: z.number().min(20).max(250),
    wallThicknessMm: z.number().min(0.8).max(8),
    bottomThicknessMm: z.number().min(0.8).max(12),
    handleWidthMm: z.number().min(20),
    handleProjectionMm: z.number().min(5).max(30),
  })
  .superRefine((value, context) => {
    if (value.wallThicknessMm * 2 >= Math.min(value.widthMm, value.depthMm)) {
      context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable interior.' })
    }
    if (value.bottomThicknessMm >= value.heightMm) {
      context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the drawer height.' })
    }
    if (value.handleWidthMm > value.widthMm - 4 * value.wallThicknessMm) {
      context.addIssue({ code: 'custom', path: ['handleWidthMm'], message: 'Handle is too wide for this drawer.' })
    }
  })

export type PotParameters = z.infer<typeof potParametersSchema>
export type DrawerParameters = z.infer<typeof drawerParametersSchema>

export const designConfigSchema = z.discriminatedUnion('type', [
  z.object({ schemaVersion: z.literal(1), type: z.literal('pot'), parameters: potParametersSchema, texture: textureSchema }),
  z.object({ schemaVersion: z.literal(1), type: z.literal('drawer'), parameters: drawerParametersSchema, texture: textureSchema }),
])

export type DesignConfig = z.infer<typeof designConfigSchema>

export const DEFAULT_POT: DesignConfig = {
  schemaVersion: 1,
  type: 'pot',
  parameters: {
    heightMm: 100,
    bottomDiameterMm: 100,
    topDiameterMm: 120,
    wallThicknessMm: 2,
    bottomThicknessMm: 3,
    drainageHoleCount: 5,
    drainageHoleDiameterMm: 6,
  },
  texture: { kind: 'ribs', amplitudeMm: 1.2, density: 24 },
}

export const DEFAULT_DRAWER: DesignConfig = {
  schemaVersion: 1,
  type: 'drawer',
  parameters: {
    widthMm: 120,
    depthMm: 90,
    heightMm: 50,
    wallThicknessMm: 2,
    bottomThicknessMm: 2.4,
    handleWidthMm: 50,
    handleProjectionMm: 12,
  },
  texture: { kind: 'ribs', amplitudeMm: 1.2, density: 12 },
}

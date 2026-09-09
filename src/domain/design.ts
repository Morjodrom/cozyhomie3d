import { z } from 'zod'
import { cavityFloorRadius, drainageHolesSchema, generateDrainageLayout } from './drainage'
export type { DrainageHole } from './drainage'

export const DESIGN_SCHEMA_VERSION = 4 as const
export const TEXTURE_VERSION = 2 as const
export const MIN_REMAINING_WALL_MM = 0.8
export const MIN_TEXTURE_FEATURE_MM = 0.6

const textureBaseSchema = z.object({
  textureVersion: z.literal(TEXTURE_VERSION),
  seed: z.number().int().min(0).max(0x7fffffff),
  scaleMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(100),
  depthMm: z.number().min(0.1).max(6),
  coveragePercent: z.number().min(10).max(100),
  reliefMode: z.enum(['emboss', 'recess']),
  bottomFadeMm: z.number().min(0).max(100),
  topFadeMm: z.number().min(0).max(100),
  quality: z.enum(['low', 'medium', 'high']),
})

export const textureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('smooth'), textureVersion: z.literal(TEXTURE_VERSION) }),
  textureBaseSchema.extend({ kind: z.enum(['ribs', 'twisted']) }),
  textureBaseSchema.extend({
    kind: z.literal('noise'),
    dimensions: z.enum(['2d', '3d']),
    octaves: z.number().int().min(1).max(6),
    persistence: z.number().min(0.1).max(0.9),
  }),
  textureBaseSchema.extend({
    kind: z.literal('honeycomb'),
    spacingMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(100),
    orientation: z.enum(['flat', 'pointy']),
  }).superRefine((value, context) => {
    if (value.spacingMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['spacingMm'], message: `Honeycomb spacing must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell face.` })
    }
  }),
  textureBaseSchema.extend({
    kind: z.literal('voronoi'),
    irregularity: z.number().min(0).max(1),
    edgeWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(20),
  }).superRefine((value, context) => {
    if (value.edgeWidthMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['edgeWidthMm'], message: `Voronoi edge width must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell interior.` })
    }
  }),
]).superRefine((texture, context) => {
  if (texture.kind === 'smooth') return
  if (texture.depthMm > texture.scaleMm / 3) {
    context.addIssue({ code: 'custom', path: ['depthMm'], message: 'Texture depth must be no more than one third of its scale.' })
  }
  if (texture.kind === 'noise' && texture.scaleMm / 2 ** (texture.octaves - 1) < MIN_TEXTURE_FEATURE_MM) {
    context.addIssue({ code: 'custom', path: ['scaleMm'], message: `Noise octave wavelength must be at least ${MIN_TEXTURE_FEATURE_MM} mm.` })
  }
})

export type TextureConfig = z.infer<typeof textureSchema>
export type TexturedTextureConfig = Exclude<TextureConfig, { kind: 'smooth' }>
export type TextureKind = TextureConfig['kind']

export const drawerTextureWallsSchema = z.object({
  front: z.boolean(),
  sides: z.boolean(),
  back: z.boolean(),
})

export type DrawerTextureWalls = z.infer<typeof drawerTextureWallsSchema>

export const DEFAULT_DRAWER_TEXTURE_WALLS: DrawerTextureWalls = {
  front: true,
  sides: true,
  back: true,
}

const commonTextureDefaults = {
  textureVersion: TEXTURE_VERSION,
  seed: 1337,
  scaleMm: 5,
  depthMm: 1.2,
  coveragePercent: 82,
  reliefMode: 'emboss' as const,
  bottomFadeMm: 3,
  topFadeMm: 3,
  quality: 'medium' as const,
}

/** UI-facing texture registry. Each factory returns a fresh v1 texture object. */
export const TEXTURE_REGISTRY = {
  smooth: { label: 'Smooth', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'smooth' as const, textureVersion: TEXTURE_VERSION }) },
  ribs: { label: 'Vertical ribs', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'ribs' as const, ...commonTextureDefaults }) },
  twisted: { label: 'Twisted / diagonal ribs', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'twisted' as const, ...commonTextureDefaults }) },
  noise: { label: 'Noise', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'noise' as const, ...commonTextureDefaults, dimensions: '2d' as const, octaves: 3, persistence: 0.5 }) },
  honeycomb: { label: 'Honeycomb', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'honeycomb' as const, ...commonTextureDefaults, scaleMm: 10, depthMm: 0.8, quality: 'high' as const, spacingMm: 1.4, orientation: 'flat' as const }) },
  voronoi: { label: 'Voronoi', supportedTypes: ['pot', 'drawer'] as const, create: () => ({ kind: 'voronoi' as const, ...commonTextureDefaults, irregularity: 0.45, edgeWidthMm: 0.8 }) },
} satisfies Record<TextureKind, { label: string; supportedTypes: readonly ('pot' | 'drawer')[]; create: () => TextureConfig }>

export const TEXTURE_KINDS = Object.keys(TEXTURE_REGISTRY) as TextureKind[]
export function createTextureDefault(kind: TextureKind): TextureConfig { return TEXTURE_REGISTRY[kind].create() }
export function textureSupportsModel(kind: TextureKind, type: 'pot' | 'drawer'): boolean {
  return TEXTURE_REGISTRY[kind].supportedTypes.includes(type)
}

export const potParametersSchema = z
  .object({
    heightMm: z.number().min(30).max(300),
    bottomDiameterMm: z.number().min(30).max(300),
    topDiameterMm: z.number().min(30).max(350),
    wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(8),
    bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(12),
    drainageHoles: drainageHolesSchema,
  })
  .superRefine((value, context) => {
    const minRadius = Math.min(value.bottomDiameterMm, value.topDiameterMm) / 2
    if (value.wallThicknessMm >= minRadius) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable cavity.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the pot height.' })
  })

export const drawerParametersSchema = z
  .object({
    widthMm: z.number().min(30).max(400), depthMm: z.number().min(30).max(400), heightMm: z.number().min(20).max(250),
    wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(8), bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(12),
    handleWidthMm: z.number().min(20), handleProjectionMm: z.number().min(5).max(30),
  })
  .superRefine((value, context) => {
    if (value.wallThicknessMm * 2 >= Math.min(value.widthMm, value.depthMm)) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable interior.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the drawer height.' })
    if (value.handleWidthMm > value.widthMm - 4 * value.wallThicknessMm) context.addIssue({ code: 'custom', path: ['handleWidthMm'], message: 'Handle is too wide for this drawer.' })
  })

export type PotParameters = z.infer<typeof potParametersSchema>
export type DrawerParameters = z.infer<typeof drawerParametersSchema>

function validateTextureSafety(texture: TextureConfig, wallThicknessMm: number, heightMm: number, context: z.RefinementCtx): void {
  if (texture.kind === 'smooth') return
  if (texture.reliefMode === 'recess' && texture.depthMm > wallThicknessMm - MIN_REMAINING_WALL_MM) {
    context.addIssue({ code: 'custom', path: ['texture', 'depthMm'], message: `Recess depth must leave at least ${MIN_REMAINING_WALL_MM} mm of wall.` })
  }
  if (texture.bottomFadeMm + texture.topFadeMm > 0 && texture.coveragePercent < 100) {
    const bandHeightMm = heightMm * texture.coveragePercent / 100
    if (texture.bottomFadeMm + texture.topFadeMm > bandHeightMm) {
      context.addIssue({ code: 'custom', path: ['texture', 'coveragePercent'], message: 'Texture fades cannot exceed the covered band.' })
    }
  }
}

export const designConfigSchema = z.discriminatedUnion('type', [
  z.object({ schemaVersion: z.literal(DESIGN_SCHEMA_VERSION), type: z.literal('pot'), parameters: potParametersSchema, texture: textureSchema }),
  z.object({
    schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
    type: z.literal('drawer'),
    parameters: drawerParametersSchema,
    texture: textureSchema,
    textureWalls: drawerTextureWallsSchema,
  }),
]).superRefine((value, context) => validateTextureSafety(value.texture, value.parameters.wallThicknessMm, value.parameters.heightMm, context))

export type DesignConfig = z.infer<typeof designConfigSchema>

export const DEFAULT_POT: DesignConfig = {
  schemaVersion: DESIGN_SCHEMA_VERSION, type: 'pot',
  parameters: {
    heightMm: 100,
    bottomDiameterMm: 100,
    topDiameterMm: 120,
    wallThicknessMm: 2,
    bottomThicknessMm: 3,
    drainageHoles: generateDrainageLayout(5, 6, {
      cavityFloorRadius: cavityFloorRadius({ heightMm: 100, bottomDiameterMm: 100, topDiameterMm: 120, wallThicknessMm: 2, bottomThicknessMm: 3 }),
      wallThicknessMm: 2,
    }),
  },
  texture: TEXTURE_REGISTRY.ribs.create(),
}

export const DEFAULT_DRAWER: DesignConfig = {
  schemaVersion: DESIGN_SCHEMA_VERSION, type: 'drawer',
  parameters: { widthMm: 120, depthMm: 90, heightMm: 50, wallThicknessMm: 2, bottomThicknessMm: 2.4, handleWidthMm: 50, handleProjectionMm: 12 },
  texture: { ...TEXTURE_REGISTRY.ribs.create(), scaleMm: 7 },
  textureWalls: { ...DEFAULT_DRAWER_TEXTURE_WALLS },
}

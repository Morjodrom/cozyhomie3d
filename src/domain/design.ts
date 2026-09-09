import { z } from 'zod'
import { cavityFloorRadius, drainageHolesSchema, generateDrainageLayout } from './drainage'
export type { DrainageHole } from './drainage'

export const DESIGN_SCHEMA_VERSION = 7 as const
// v3 changes the representation from sampled displacement to vector relief.
// Older saved texture objects intentionally fail validation and reset.
export const TEXTURE_VERSION = 3 as const
export const MIN_REMAINING_WALL_MM = 0.8
export const MIN_TEXTURE_FEATURE_MM = 0.6
export const MIN_BOTTOM_RIB_LAND_MM = 0.6

const bottomRibsBaseSchema = z.object({
  enabled: z.boolean(),
  widthMm: z.number().min(0.6).max(20),
  depthMm: z.number().min(0.1).max(6),
})

export const potBottomRibsSchema = bottomRibsBaseSchema.extend({
  pattern: z.literal('concentric'),
  count: z.number().int().min(0).max(50),
})

export const drawerBottomRibsSchema = bottomRibsBaseSchema.extend({
  pattern: z.literal('grid'),
  xCount: z.number().int().min(0).max(50),
  yCount: z.number().int().min(0).max(50),
})

export type PotBottomRibs = z.infer<typeof potBottomRibsSchema>
export type DrawerBottomRibs = z.infer<typeof drawerBottomRibsSchema>

export const DEFAULT_POT_BOTTOM_RIBS: PotBottomRibs = {
  enabled: true,
  pattern: 'concentric',
  count: 3,
  depthMm: 2,
  widthMm: 3,
}

export const DEFAULT_DRAWER_BOTTOM_RIBS: DrawerBottomRibs = {
  enabled: true,
  pattern: 'grid',
  xCount: 5,
  yCount: 5,
  depthMm: 2,
  widthMm: 3,
}

function validateBottomRibDepth(
  ribs: { enabled: boolean; depthMm: number },
  bottomThicknessMm: number,
  context: z.RefinementCtx,
): void {
  if (ribs.enabled && ribs.depthMm > bottomThicknessMm - MIN_REMAINING_WALL_MM) {
    context.addIssue({
      code: 'custom',
      path: ['bottomRibs', 'depthMm'],
      message: `Rib depth must leave at least ${MIN_REMAINING_WALL_MM} mm of floor.`,
    })
  }
}

function validateBottomRibSpacing(
  widthMm: number,
  spacingMm: number,
  path: PropertyKey[],
  context: z.RefinementCtx,
): void {
  if (widthMm + MIN_BOTTOM_RIB_LAND_MM > spacingMm) {
    context.addIssue({
      code: 'custom',
      path,
      message: `Ribs must leave at least ${MIN_BOTTOM_RIB_LAND_MM} mm between neighboring grooves.`,
    })
  }
}

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

export const edgeTreatmentSchema = z.object({
  style: z.enum(['none', 'rounded', 'chamfered']),
  sizeMm: z.number().positive().max(20),
})

export type EdgeTreatment = z.infer<typeof edgeTreatmentSchema>
export const DEFAULT_EDGE_TREATMENT: EdgeTreatment = { style: 'rounded', sizeMm: 1 }

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
    edgeTreatment: edgeTreatmentSchema,
    drainageHoleRounding: z.object({ enabled: z.boolean(), radiusMm: z.number().positive().max(10) }),
    drainageHoles: drainageHolesSchema,
    bottomRibs: potBottomRibsSchema,
  })
  .superRefine((value, context) => {
    const minRadius = Math.min(value.bottomDiameterMm, value.topDiameterMm) / 2
    if (value.wallThicknessMm >= minRadius) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable cavity.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the pot height.' })
    if (value.edgeTreatment.style !== 'none' && value.edgeTreatment.sizeMm > Math.min(value.wallThicknessMm, value.bottomThicknessMm) / 2) context.addIssue({ code: 'custom', path: ['edgeTreatment', 'sizeMm'], message: 'Edge treatment must be no more than half the smaller wall or bottom thickness.' })
    if (value.drainageHoleRounding.enabled) {
      for (const hole of value.drainageHoles.filter((candidate) => candidate.enabled)) {
        const availableDepth = hole.countersink ? value.bottomThicknessMm - hole.countersink.depthMm : value.bottomThicknessMm / 2
        if (value.drainageHoleRounding.radiusMm > Math.min(hole.diameterMm / 2, availableDepth)) {
          context.addIssue({ code: 'custom', path: ['drainageHoleRounding', 'radiusMm'], message: 'Drainage rounding is too large for the hole diameter or available bottom thickness.' })
          break
        }
      }
    }
    validateBottomRibDepth(value.bottomRibs, value.bottomThicknessMm, context)
    if (value.bottomRibs.enabled) {
      if (value.bottomRibs.count < 1) {
        context.addIssue({ code: 'custom', path: ['bottomRibs', 'count'], message: 'An enabled pot must have at least one concentric rib.' })
      } else {
        validateBottomRibSpacing(
          value.bottomRibs.widthMm,
          value.bottomDiameterMm / 2 / (value.bottomRibs.count + 1),
          ['bottomRibs', 'widthMm'],
          context,
        )
      }
    }
  })

export const drawerParametersSchema = z
  .object({
    widthMm: z.number().min(30).max(400), depthMm: z.number().min(30).max(400), heightMm: z.number().min(20).max(250),
    wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(8), bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(12),
    edgeTreatment: edgeTreatmentSchema,
    handleStyle: z.enum(['projecting', 'recessed']),
    handleWidthMm: z.number().min(20),
    handleHeightMm: z.number().min(5),
    handleDepthMm: z.number().min(5).max(30),
    handleCornerRadiusMm: z.number().min(0),
    handlePositionPercent: z.number().min(0).max(100),
    bottomRibs: drawerBottomRibsSchema,
  })
  .superRefine((value, context) => {
    if (value.wallThicknessMm * 2 >= Math.min(value.widthMm, value.depthMm)) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable interior.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the drawer height.' })
    if (value.edgeTreatment.style !== 'none' && value.edgeTreatment.sizeMm > Math.min(value.wallThicknessMm, value.bottomThicknessMm) / 2) context.addIssue({ code: 'custom', path: ['edgeTreatment', 'sizeMm'], message: 'Edge treatment must be no more than half the smaller wall or bottom thickness.' })
    if (value.handleWidthMm > value.widthMm - 4 * value.wallThicknessMm) context.addIssue({ code: 'custom', path: ['handleWidthMm'], message: 'Handle is too wide for this drawer.' })
    if (value.handleStyle === 'projecting' && value.handleHeightMm > value.heightMm) context.addIssue({ code: 'custom', path: ['handleHeightMm'], message: 'Handle is taller than the drawer.' })
    if (value.handleStyle === 'projecting' && value.handleDepthMm > value.handleHeightMm) context.addIssue({ code: 'custom', path: ['handleDepthMm'], message: 'Projection must not exceed handle height so the underside remains printable.' })
    if (value.handleStyle === 'recessed' && value.handleHeightMm + 2 * value.wallThicknessMm > value.heightMm) context.addIssue({ code: 'custom', path: ['handleHeightMm'], message: 'Opening and its reinforcing rib are taller than the drawer.' })
    if (value.handleStyle === 'recessed' && value.handleDepthMm + value.wallThicknessMm > value.depthMm - 2 * value.wallThicknessMm) context.addIssue({ code: 'custom', path: ['handleDepthMm'], message: 'Reinforcing rib is too deep for this drawer.' })
    if (value.handleStyle === 'recessed' && value.handleCornerRadiusMm > Math.min(value.handleWidthMm, value.handleHeightMm) / 2) context.addIssue({ code: 'custom', path: ['handleCornerRadiusMm'], message: 'Corner radius cannot exceed half of the smaller opening dimension.' })
    validateBottomRibDepth(value.bottomRibs, value.bottomThicknessMm, context)
    if (value.bottomRibs.enabled) {
      if (value.bottomRibs.xCount + value.bottomRibs.yCount < 1) {
        context.addIssue({ code: 'custom', path: ['bottomRibs', 'xCount'], message: 'An enabled drawer must have at least one rib direction.' })
      }
      if (value.bottomRibs.xCount > 0) {
        validateBottomRibSpacing(
          value.bottomRibs.widthMm,
          value.depthMm / (value.bottomRibs.xCount + 1),
          ['bottomRibs', 'widthMm'],
          context,
        )
      }
      if (value.bottomRibs.yCount > 0) {
        validateBottomRibSpacing(
          value.bottomRibs.widthMm,
          value.widthMm / (value.bottomRibs.yCount + 1),
          ['bottomRibs', 'widthMm'],
          context,
        )
      }
    }
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
    edgeTreatment: { ...DEFAULT_EDGE_TREATMENT },
    drainageHoleRounding: { enabled: false, radiusMm: 1 },
    bottomRibs: { ...DEFAULT_POT_BOTTOM_RIBS },
    drainageHoles: generateDrainageLayout(5, 6, {
      cavityFloorRadius: cavityFloorRadius({ heightMm: 100, bottomDiameterMm: 100, topDiameterMm: 120, wallThicknessMm: 2, bottomThicknessMm: 3 }),
      wallThicknessMm: 2,
    }),
  },
  texture: TEXTURE_REGISTRY.ribs.create(),
}

export const DEFAULT_DRAWER: DesignConfig = {
  schemaVersion: DESIGN_SCHEMA_VERSION, type: 'drawer',
  parameters: {
    widthMm: 120, depthMm: 90, heightMm: 50, wallThicknessMm: 2, bottomThicknessMm: 3,
    edgeTreatment: { ...DEFAULT_EDGE_TREATMENT },
    handleStyle: 'projecting', handleWidthMm: 50, handleHeightMm: 12, handleDepthMm: 12, handleCornerRadiusMm: 3, handlePositionPercent: 0,
    bottomRibs: { ...DEFAULT_DRAWER_BOTTOM_RIBS },
  },
  texture: { ...TEXTURE_REGISTRY.ribs.create(), scaleMm: 7 },
  textureWalls: { ...DEFAULT_DRAWER_TEXTURE_WALLS },
}

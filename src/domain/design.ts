import { z } from 'zod'
import { cavityFloorRadius, drainageHolesSchema, generateDrainageLayout } from './drainage'
export type { DrainageHole } from './drainage'

export const MIN_REMAINING_WALL_MM = 0.8
export const MIN_TEXTURE_FEATURE_MM = 0.6
export const FRACTAL_BRANCH_LENGTH_RATIO = 0.62
export const FRACTAL_BRANCH_WIDTH_RATIO = 0.75
export const MIN_BOTTOM_RIB_LAND_MM = 0.6
export const MIN_RIGIDITY_RIB_LAND_MM = 0.6
export const MIN_TRAY_ENGAGEMENT_WIDTH_MM = 1.2
export const MAX_TRAY_ENGAGEMENT_WIDTH_MM = 25

const bottomRibsBaseSchema = z.strictObject({
  enabled: z.boolean(),
  widthMm: z.number().min(0.6).max(50),
  depthMm: z.number().min(0.1).max(20),
})

export const potBottomRibsSchema = bottomRibsBaseSchema.extend({
  pattern: z.literal('concentric'),
  count: z.number().int().min(0).max(100),
})

export const drawerBottomRibsSchema = bottomRibsBaseSchema.extend({
  pattern: z.literal('grid'),
  xCount: z.number().int().min(0).max(100),
  yCount: z.number().int().min(0).max(100),
})

export type PotBottomRibs = z.infer<typeof potBottomRibsSchema>
export type DrawerBottomRibs = z.infer<typeof drawerBottomRibsSchema>

const rigidityRibsBaseSchema = z.strictObject({
  enabled: z.boolean(),
  placement: z.enum(['inside', 'outside']),
  projectionMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(20),
  baseWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM * 2).max(40),
  wallBottomGussetMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(20),
})

export const potRigidityRibsSchema = rigidityRibsBaseSchema.extend({
  pattern: z.literal('hoops'),
  count: z.number().int().min(0).max(60),
})

export const drawerRigidityRibsSchema = rigidityRibsBaseSchema.extend({
  pattern: z.literal('vertical'),
  frontBackCount: z.number().int().min(0).max(60),
  sideCount: z.number().int().min(0).max(60),
})

export type PotRigidityRibs = z.infer<typeof potRigidityRibsSchema>
export type DrawerRigidityRibs = z.infer<typeof drawerRigidityRibsSchema>

export const DEFAULT_POT_RIGIDITY_RIBS: PotRigidityRibs = {
  enabled: true, placement: 'inside', pattern: 'hoops', projectionMm: 2, baseWidthMm: 4, wallBottomGussetMm: 3, count: 2,
}

export const DEFAULT_DRAWER_RIGIDITY_RIBS: DrawerRigidityRibs = {
  enabled: true, placement: 'inside', pattern: 'vertical', projectionMm: 2, baseWidthMm: 4, wallBottomGussetMm: 3, frontBackCount: 3, sideCount: 2,
}

function validateRigidityProfile(ribs: { enabled: boolean; placement: 'inside' | 'outside'; projectionMm: number; baseWidthMm: number; wallBottomGussetMm: number }, heightMm: number, cavityHalfSpanMm: number, context: z.RefinementCtx): void {
  if (!ribs.enabled) return
  if (ribs.baseWidthMm < 2 * ribs.projectionMm) {
    context.addIssue({ code: 'custom', path: ['rigidityRibs', 'baseWidthMm'], message: 'Rib base width must be at least twice its projection for printable 45-degree flanks.' })
  }
  if (ribs.wallBottomGussetMm < ribs.projectionMm) {
    context.addIssue({ code: 'custom', path: ['rigidityRibs', 'wallBottomGussetMm'], message: 'Wall-to-bottom gusset must be at least as large as the rib projection.' })
  }
  if (ribs.wallBottomGussetMm + ribs.baseWidthMm / 2 + MIN_RIGIDITY_RIB_LAND_MM >= heightMm) {
    context.addIssue({ code: 'custom', path: ['rigidityRibs', 'wallBottomGussetMm'], message: 'Rigidity ribs leave no printable vertical spacing.' })
  }
  const insideExtent = Math.max(ribs.projectionMm, ribs.wallBottomGussetMm)
  if (ribs.placement === 'inside' && insideExtent + MIN_RIGIDITY_RIB_LAND_MM > cavityHalfSpanMm) {
    context.addIssue({
      code: 'custom',
      path: ['rigidityRibs', ribs.wallBottomGussetMm > ribs.projectionMm ? 'wallBottomGussetMm' : 'projectionMm'],
      message: 'Inside rib projection or gusset leaves no usable cavity.',
    })
  }
}

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
  featureName = 'grooves',
): void {
  if (widthMm + MIN_BOTTOM_RIB_LAND_MM > spacingMm) {
    context.addIssue({
      code: 'custom',
      path,
      message: `Ribs must leave at least ${MIN_BOTTOM_RIB_LAND_MM} mm between neighboring ${featureName}.`,
    })
  }
}

const textureBaseSchema = z.strictObject({
  seed: z.number().int().min(0).max(0xffffffff),
  scaleMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(250),
  depthMm: z.number().min(0.1).max(20),
  bottomOffsetPercent: z.number().min(0).max(100),
  topOffsetPercent: z.number().min(0).max(100),
  reliefMode: z.enum(['emboss', 'recess']),
  quality: z.enum(['low', 'medium', 'high']),
})

const fadedTextureBaseSchema = textureBaseSchema.extend({
  bottomFadeMm: z.number().min(0).max(500),
  topFadeMm: z.number().min(0).max(500),
})

export const textureSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('smooth') }),
  textureBaseSchema.extend({ kind: z.literal('ribs'), angleDeg: z.number().min(-60).max(60) }),
  fadedTextureBaseSchema.extend({
    kind: z.literal('noise'),
    dimensions: z.enum(['2d', '3d']),
    octaves: z.number().int().min(1).max(8),
    persistence: z.number().min(0.1).max(1),
  }),
  fadedTextureBaseSchema.extend({
    kind: z.literal('honeycomb'),
    spacingMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(250),
    orientation: z.enum(['flat', 'pointy']),
  }).superRefine((value, context) => {
    if (value.spacingMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['spacingMm'], message: `Honeycomb spacing must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell face.` })
    }
  }),
  fadedTextureBaseSchema.extend({
    kind: z.literal('voronoi'),
    irregularity: z.number().min(0).max(1),
    edgeWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(50),
  }).superRefine((value, context) => {
    if (value.edgeWidthMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['edgeWidthMm'], message: `Voronoi edge width must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell interior.` })
    }
  }),
  fadedTextureBaseSchema.extend({
    kind: z.literal('fractal'),
    levels: z.number().int().min(2).max(8),
    branchAngleDeg: z.number().min(10).max(70),
    branchWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(50),
  }).superRefine((value, context) => {
    const smallestLengthMm = value.scaleMm * FRACTAL_BRANCH_LENGTH_RATIO ** (value.levels - 1)
    if (smallestLengthMm < MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['scaleMm'], message: `Smallest fractal branch must be at least ${MIN_TEXTURE_FEATURE_MM} mm long.` })
    }
    const smallestWidthMm = value.branchWidthMm * FRACTAL_BRANCH_WIDTH_RATIO ** (value.levels - 1)
    if (smallestWidthMm < MIN_TEXTURE_FEATURE_MM) {
      context.addIssue({ code: 'custom', path: ['branchWidthMm'], message: `Smallest fractal branch must be at least ${MIN_TEXTURE_FEATURE_MM} mm wide.` })
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

export const drawerTextureWallsSchema = z.strictObject({
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

export const edgeTreatmentSchema = z.strictObject({
  style: z.enum(['none', 'rounded', 'chamfered']),
  sizeMm: z.number().positive().max(100),
})

export type EdgeTreatment = z.infer<typeof edgeTreatmentSchema>
export const DEFAULT_EDGE_TREATMENT: EdgeTreatment = { style: 'rounded', sizeMm: 1 }

const commonTextureDefaults = {
  seed: 1337,
  scaleMm: 5,
  depthMm: 1.2,
  bottomOffsetPercent: 9,
  topOffsetPercent: 9,
  reliefMode: 'emboss' as const,
  bottomFadeMm: 3,
  topFadeMm: 3,
  quality: 'medium' as const,
}

const ribTextureDefaults = {
  seed: commonTextureDefaults.seed,
  scaleMm: commonTextureDefaults.scaleMm,
  depthMm: commonTextureDefaults.depthMm,
  bottomOffsetPercent: commonTextureDefaults.bottomOffsetPercent,
  topOffsetPercent: commonTextureDefaults.topOffsetPercent,
  reliefMode: commonTextureDefaults.reliefMode,
  quality: commonTextureDefaults.quality,
}

/** UI-facing texture registry. Each factory returns a fresh texture object. */
export const TEXTURE_REGISTRY = {
  smooth: { label: 'Smooth', create: () => ({ kind: 'smooth' as const }) },
  ribs: { label: 'Ribs', create: () => ({ kind: 'ribs' as const, ...ribTextureDefaults, angleDeg: 0 }) },
  noise: { label: 'Noise', create: () => ({ kind: 'noise' as const, ...commonTextureDefaults, dimensions: '2d' as const, octaves: 3, persistence: 0.5 }) },
  honeycomb: { label: 'Honeycomb', create: () => ({ kind: 'honeycomb' as const, ...commonTextureDefaults, scaleMm: 10, depthMm: 0.8, quality: 'high' as const, spacingMm: 1.4, orientation: 'flat' as const }) },
  voronoi: { label: 'Voronoi', create: () => ({ kind: 'voronoi' as const, ...commonTextureDefaults, irregularity: 0.45, edgeWidthMm: 0.8 }) },
  fractal: { label: 'Fractal branches', create: () => ({ kind: 'fractal' as const, ...commonTextureDefaults, scaleMm: 18, depthMm: 0.8, levels: 4, branchAngleDeg: 32, branchWidthMm: 2 }) },
} satisfies Record<TextureKind, { label: string; create: () => TextureConfig }>

export const TEXTURE_KINDS = Object.keys(TEXTURE_REGISTRY) as TextureKind[]
export function createTextureDefault(kind: TextureKind): TextureConfig { return TEXTURE_REGISTRY[kind].create() }

export const potParametersSchema = z
  .strictObject({
    heightMm: z.number().min(30).max(1000),
    bottomDiameterMm: z.number().min(30).max(1000),
    topDiameterMm: z.number().min(30).max(1000),
    wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(20),
    bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
    edgeTreatment: edgeTreatmentSchema,
    drainageHoleRounding: z.strictObject({ enabled: z.boolean(), radiusMm: z.number().positive().max(25) }),
    drainageHoles: drainageHolesSchema,
    bottomRibs: potBottomRibsSchema,
    rigidityRibs: potRigidityRibsSchema,
  })
  .superRefine((value, context) => {
    const minRadius = Math.min(value.bottomDiameterMm, value.topDiameterMm) / 2
    if (value.wallThicknessMm >= minRadius) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable cavity.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the pot height.' })
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
    validateRigidityProfile(value.rigidityRibs, value.heightMm - value.bottomThicknessMm, minRadius - value.wallThicknessMm, context)
    if (value.rigidityRibs.enabled) {
      if (value.rigidityRibs.count < 1) context.addIssue({ code: 'custom', path: ['rigidityRibs', 'count'], message: 'An enabled pot must have at least one hoop.' })
      const lowestCenter = value.bottomThicknessMm + value.rigidityRibs.wallBottomGussetMm + value.rigidityRibs.baseWidthMm + MIN_RIGIDITY_RIB_LAND_MM
      const highestCenter = value.heightMm - value.rigidityRibs.baseWidthMm / 2
      const pitch = (highestCenter - lowestCenter) / value.rigidityRibs.count
      if (value.rigidityRibs.count > 1 && pitch < value.rigidityRibs.baseWidthMm + MIN_RIGIDITY_RIB_LAND_MM) {
        context.addIssue({ code: 'custom', path: ['rigidityRibs', 'count'], message: `Hoops must leave at least ${MIN_RIGIDITY_RIB_LAND_MM} mm between neighboring ribs.` })
      }
    }
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

export const trayParametersSchema = z
  .strictObject({
    heightMm: z.number().min(8).max(1000),
    wallThicknessMm: z.number().min(MIN_TRAY_ENGAGEMENT_WIDTH_MM).max(20),
    bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
    engagementWidthMm: z.number().min(MIN_TRAY_ENGAGEMENT_WIDTH_MM).max(MAX_TRAY_ENGAGEMENT_WIDTH_MM),
    engagementDepthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(25),
    fitClearanceMm: z.number().min(0.1).max(2),
    previewGapMm: z.number().min(0).max(500),
  })
  .superRefine((value, context) => {
    if (value.engagementWidthMm > value.wallThicknessMm) {
      context.addIssue({ code: 'custom', path: ['engagementWidthMm'], message: 'Engagement width must not exceed tray wall thickness.' })
    }
  })

export const drawerParametersSchema = z
  .strictObject({
    widthMm: z.number().min(30).max(1000), depthMm: z.number().min(30).max(1000), heightMm: z.number().min(20).max(1000),
    wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(20), bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
    edgeTreatment: edgeTreatmentSchema,
    handleStyle: z.enum(['projecting', 'recessed']),
    handleWidthMm: z.number().min(20),
    handleHeightMm: z.number().min(5),
    handleDepthMm: z.number().min(5).max(100),
    handleCornerRadiusMm: z.number().min(0),
    handlePositionPercent: z.number().min(0).max(100),
    bottomRibs: drawerBottomRibsSchema,
    rigidityRibs: drawerRigidityRibsSchema,
  })
  .superRefine((value, context) => {
    if (value.wallThicknessMm * 2 >= Math.min(value.widthMm, value.depthMm)) context.addIssue({ code: 'custom', path: ['wallThicknessMm'], message: 'Wall thickness leaves no usable interior.' })
    if (value.bottomThicknessMm >= value.heightMm) context.addIssue({ code: 'custom', path: ['bottomThicknessMm'], message: 'Bottom must be thinner than the drawer height.' })
    if (value.handleWidthMm > value.widthMm - 4 * value.wallThicknessMm) context.addIssue({ code: 'custom', path: ['handleWidthMm'], message: 'Handle is too wide for this drawer.' })
    if (value.handleStyle === 'projecting' && value.handleHeightMm > value.heightMm) context.addIssue({ code: 'custom', path: ['handleHeightMm'], message: 'Handle is taller than the drawer.' })
    if (value.handleStyle === 'projecting' && value.handleDepthMm > value.handleHeightMm) context.addIssue({ code: 'custom', path: ['handleDepthMm'], message: 'Projection must not exceed handle height so the underside remains printable.' })
    if (value.handleStyle === 'recessed' && value.handleHeightMm + 2 * value.wallThicknessMm > value.heightMm) context.addIssue({ code: 'custom', path: ['handleHeightMm'], message: 'Opening and its reinforcing rib are taller than the drawer.' })
    if (value.handleStyle === 'recessed' && value.handleDepthMm + value.wallThicknessMm > value.depthMm - 2 * value.wallThicknessMm) context.addIssue({ code: 'custom', path: ['handleDepthMm'], message: 'Reinforcing rib is too deep for this drawer.' })
    if (value.handleStyle === 'recessed' && value.handleCornerRadiusMm > Math.min(value.handleWidthMm, value.handleHeightMm) / 2) context.addIssue({ code: 'custom', path: ['handleCornerRadiusMm'], message: 'Corner radius cannot exceed half of the smaller opening dimension.' })
    validateBottomRibDepth(value.bottomRibs, value.bottomThicknessMm, context)
    validateRigidityProfile(value.rigidityRibs, value.heightMm - value.bottomThicknessMm, Math.min(value.widthMm, value.depthMm) / 2 - value.wallThicknessMm, context)
    if (value.rigidityRibs.enabled) {
      if (value.rigidityRibs.frontBackCount + value.rigidityRibs.sideCount < 1) context.addIssue({ code: 'custom', path: ['rigidityRibs', 'frontBackCount'], message: 'An enabled drawer must have at least one rigidity rib.' })
      if (value.rigidityRibs.frontBackCount > 0) validateBottomRibSpacing(value.rigidityRibs.baseWidthMm, (value.widthMm - 2 * value.wallThicknessMm) / (value.rigidityRibs.frontBackCount + 1), ['rigidityRibs', 'baseWidthMm'], context, 'ribs')
      if (value.rigidityRibs.sideCount > 0) validateBottomRibSpacing(value.rigidityRibs.baseWidthMm, (value.depthMm - 2 * value.wallThicknessMm) / (value.rigidityRibs.sideCount + 1), ['rigidityRibs', 'baseWidthMm'], context, 'ribs')
    }
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
export type TrayParameters = z.infer<typeof trayParametersSchema>

export type TrayConnectorDimensions = {
  trayBottomRadiusMm: number
  tongueThicknessMm: number
  tongueInnerRadiusMm: number
  tongueOuterRadiusMm: number
  tongueHeightMm: number
  grooveInnerRadiusMm: number
  grooveOuterRadiusMm: number
  bottomRibRadiusMm: number
}

export function trayConnectorDimensions(parameters: PotParameters, tray: TrayParameters): TrayConnectorDimensions {
  const bottomRadiusMm = parameters.bottomDiameterMm / 2
  const slope = (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm
  const tongueThicknessMm = tray.engagementWidthMm
  // Keep the connector behind the full nominal pot wall. A recessed texture
  // may remove all but MIN_REMAINING_WALL_MM from that wall; placing the groove
  // only MIN_REMAINING_WALL_MM from the untextured exterior can therefore cut
  // the floor loose at the seam.
  const grooveOuterRadiusMm = bottomRadiusMm - parameters.wallThicknessMm
  const grooveInnerRadiusMm = grooveOuterRadiusMm - tongueThicknessMm - 2 * tray.fitClearanceMm
  const tongueOuterRadiusMm = grooveOuterRadiusMm - tray.fitClearanceMm
  return {
    trayBottomRadiusMm: bottomRadiusMm - slope * tray.heightMm,
    tongueThicknessMm,
    tongueInnerRadiusMm: tongueOuterRadiusMm - tongueThicknessMm,
    tongueOuterRadiusMm,
    tongueHeightMm: tray.engagementDepthMm - tray.fitClearanceMm,
    grooveInnerRadiusMm,
    grooveOuterRadiusMm,
    bottomRibRadiusMm: grooveInnerRadiusMm - MIN_BOTTOM_RIB_LAND_MM,
  }
}

function validatePotWithTray(value: { parameters: PotParameters; tray: TrayParameters }, context: z.RefinementCtx): void {
  const { parameters, tray } = value
  const connector = trayConnectorDimensions(parameters, tray)
  const minimumTrayRadius = Math.min(parameters.bottomDiameterMm / 2, connector.trayBottomRadiusMm)
  if (connector.trayBottomRadiusMm <= tray.wallThicknessMm + MIN_REMAINING_WALL_MM) {
    context.addIssue({ code: 'custom', path: ['tray', 'heightMm'], message: 'The projected tray bottom leaves no usable cavity.' })
  }
  if (tray.bottomThicknessMm >= tray.heightMm) {
    context.addIssue({ code: 'custom', path: ['tray', 'bottomThicknessMm'], message: 'Tray bottom must be thinner than the tray height.' })
  }
  if (tray.engagementDepthMm > parameters.bottomThicknessMm - MIN_REMAINING_WALL_MM) {
    context.addIssue({ code: 'custom', path: ['tray', 'engagementDepthMm'], message: `Connector depth must leave at least ${MIN_REMAINING_WALL_MM} mm of pot floor.` })
  }
  if (connector.tongueHeightMm < MIN_TEXTURE_FEATURE_MM) {
    context.addIssue({ code: 'custom', path: ['tray', 'fitClearanceMm'], message: `Fit clearance must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of tongue height.` })
  }
  if (connector.grooveInnerRadiusMm <= MIN_REMAINING_WALL_MM || minimumTrayRadius <= tray.wallThicknessMm) {
    context.addIssue({ code: 'custom', path: ['tray', 'wallThicknessMm'], message: 'Tray wall and connector do not fit inside the projected profile.' })
  }
  if (parameters.rigidityRibs.enabled && parameters.rigidityRibs.placement === 'outside') {
    context.addIssue({ code: 'custom', path: ['parameters', 'rigidityRibs', 'placement'], message: 'Pot + tray requires inside rigidity ribs to keep the seam flush.' })
  }

  const cavityRadius = cavityFloorRadius(parameters)
  for (const hole of parameters.drainageHoles.filter((candidate) => candidate.enabled)) {
    const holeRadius = Math.max(hole.diameterMm, hole.countersink?.diameterMm ?? 0) / 2
    const centerRadius = Math.hypot(hole.position.x, hole.position.y) * cavityRadius
    if (centerRadius + holeRadius + MIN_BOTTOM_RIB_LAND_MM > connector.grooveInnerRadiusMm) {
      context.addIssue({ code: 'custom', path: ['parameters', 'drainageHoles'], message: 'Drainage holes must stay inside the tray connector ring.' })
      break
    }
  }
  if (parameters.bottomRibs.enabled && parameters.bottomRibs.count > 0) {
    validateBottomRibSpacing(
      parameters.bottomRibs.widthMm,
      connector.bottomRibRadiusMm / (parameters.bottomRibs.count + 1),
      ['parameters', 'bottomRibs', 'widthMm'],
      context,
    )
  }
}

function validateTextureSafety(texture: TextureConfig, wallThicknessMm: number, context: z.RefinementCtx): void {
  if (texture.kind === 'smooth') return
  if (texture.reliefMode === 'recess' && texture.depthMm > wallThicknessMm - MIN_REMAINING_WALL_MM) {
    context.addIssue({ code: 'custom', path: ['texture', 'depthMm'], message: `Recess depth must leave at least ${MIN_REMAINING_WALL_MM} mm of wall.` })
  }
}

export const designConfigSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('pot'), parameters: potParametersSchema, texture: textureSchema }),
  z.strictObject({
    type: z.literal('pot-with-tray'),
    parameters: potParametersSchema,
    tray: trayParametersSchema,
    texture: textureSchema,
  }).superRefine(validatePotWithTray),
  z.strictObject({
    type: z.literal('drawer'),
    parameters: drawerParametersSchema,
    texture: textureSchema,
    textureWalls: drawerTextureWallsSchema,
  }),
]).superRefine((value, context) => validateTextureSafety(
  value.texture,
  value.parameters.wallThicknessMm,
  context,
))

export type DesignConfig = z.infer<typeof designConfigSchema>

export const DEFAULT_POT: DesignConfig = {
  type: 'pot',
  parameters: {
    heightMm: 100,
    bottomDiameterMm: 100,
    topDiameterMm: 120,
    wallThicknessMm: 2,
    bottomThicknessMm: 3,
    edgeTreatment: { ...DEFAULT_EDGE_TREATMENT },
    drainageHoleRounding: { enabled: false, radiusMm: 1 },
    bottomRibs: { ...DEFAULT_POT_BOTTOM_RIBS },
    rigidityRibs: { ...DEFAULT_POT_RIGIDITY_RIBS },
    drainageHoles: generateDrainageLayout(5, 6, {
      cavityFloorRadius: cavityFloorRadius({ heightMm: 100, bottomDiameterMm: 100, topDiameterMm: 120, wallThicknessMm: 2, bottomThicknessMm: 3 }),
      wallThicknessMm: 2,
    }),
  },
  texture: TEXTURE_REGISTRY.ribs.create(),
}

export const DEFAULT_POT_WITH_TRAY: DesignConfig = {
  ...DEFAULT_POT,
  type: 'pot-with-tray',
  parameters: {
    ...DEFAULT_POT.parameters,
    drainageHoles: DEFAULT_POT.type === 'pot' ? DEFAULT_POT.parameters.drainageHoles.map((hole) => ({ ...hole, position: { ...hole.position } })) : [],
    bottomRibs: { ...DEFAULT_POT.parameters.bottomRibs },
    rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs },
    edgeTreatment: { ...DEFAULT_POT.parameters.edgeTreatment },
    drainageHoleRounding: { ...DEFAULT_POT.parameters.drainageHoleRounding },
  },
  tray: {
    heightMm: 18,
    wallThicknessMm: 2,
    bottomThicknessMm: 3,
    engagementWidthMm: 2,
    engagementDepthMm: 1.5,
    fitClearanceMm: 0.25,
    previewGapMm: 12,
  },
}

export const DEFAULT_DRAWER: DesignConfig = {
  type: 'drawer',
  parameters: {
    widthMm: 120, depthMm: 90, heightMm: 50, wallThicknessMm: 2, bottomThicknessMm: 3,
    edgeTreatment: { ...DEFAULT_EDGE_TREATMENT },
    handleStyle: 'projecting', handleWidthMm: 50, handleHeightMm: 12, handleDepthMm: 12, handleCornerRadiusMm: 3, handlePositionPercent: 0,
    bottomRibs: { ...DEFAULT_DRAWER_BOTTOM_RIBS },
    rigidityRibs: { ...DEFAULT_DRAWER_RIGIDITY_RIBS },
  },
  texture: { ...TEXTURE_REGISTRY.ribs.create(), scaleMm: 7 },
  textureWalls: { ...DEFAULT_DRAWER_TEXTURE_WALLS },
}

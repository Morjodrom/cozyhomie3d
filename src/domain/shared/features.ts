import { z } from 'zod';
import {
    MIN_BOTTOM_RIB_LAND_MM,
    MIN_REMAINING_WALL_MM,
    MIN_RIGIDITY_RIB_LAND_MM,
    MIN_TEXTURE_FEATURE_MM,
} from './constants';
import { type TextureConfig } from './textures';

export const bedAdhesionBeamsSchema = z
    .strictObject({
        count: z.union([z.literal(0), z.literal(4), z.literal(8)]),
        widthMm: z.number().positive().max(5),
        lengthMm: z.number().positive().max(20),
        modelSideHeightMm: z.number().min(0).max(20),
        outerSideHeightMm: z.number().min(0).max(20),
        breakawayDistanceMm: z.number().min(-5).max(5),
    })
    .superRefine((value, context) => {
        if (value.modelSideHeightMm === 0 && value.outerSideHeightMm === 0) {
            context.addIssue({
                code: 'custom',
                path: ['modelSideHeightMm'],
                message: 'At least one beam side must have a positive height.',
            });
        }
    });

export type BedAdhesionBeams = z.infer<typeof bedAdhesionBeamsSchema>;

export const DEFAULT_BED_ADHESION_BEAMS: BedAdhesionBeams = {
    count: 4,
    widthMm: 5,
    lengthMm: 15,
    modelSideHeightMm: 0,
    outerSideHeightMm: 3,
    breakawayDistanceMm: 0.05,
};

export const bottomRibsBaseSchema = z.strictObject({
    enabled: z.boolean(),
    widthMm: z.number().min(0.6).max(50),
    depthMm: z.number().min(0.1).max(20),
});

export const rigidityRibsBaseSchema = z.strictObject({
    enabled: z.boolean(),
    placement: z.enum(['inside', 'outside']),
    projectionMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(20),
    baseWidthMm: z
        .number()
        .min(MIN_TEXTURE_FEATURE_MM * 2)
        .max(40),
    wallBottomGussetMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(20),
});

export function validateRigidityProfile(
    ribs: {
        enabled: boolean;
        placement: 'inside' | 'outside';
        projectionMm: number;
        baseWidthMm: number;
        wallBottomGussetMm: number;
    },
    heightMm: number,
    cavityHalfSpanMm: number,
    context: z.RefinementCtx,
): void {
    if (!ribs.enabled) return;
    if (ribs.baseWidthMm < 2 * ribs.projectionMm) {
        context.addIssue({
            code: 'custom',
            path: ['rigidityRibs', 'baseWidthMm'],
            message:
                'Rib base width must be at least twice its projection for printable 45-degree flanks.',
        });
    }
    if (ribs.wallBottomGussetMm < ribs.projectionMm) {
        context.addIssue({
            code: 'custom',
            path: ['rigidityRibs', 'wallBottomGussetMm'],
            message: 'Wall-to-bottom gusset must be at least as large as the rib projection.',
        });
    }
    if (ribs.wallBottomGussetMm + ribs.baseWidthMm / 2 + MIN_RIGIDITY_RIB_LAND_MM >= heightMm) {
        context.addIssue({
            code: 'custom',
            path: ['rigidityRibs', 'wallBottomGussetMm'],
            message: 'Rigidity ribs leave no printable vertical spacing.',
        });
    }
    const insideExtent = Math.max(ribs.projectionMm, ribs.wallBottomGussetMm);
    if (ribs.placement === 'inside' && insideExtent + MIN_RIGIDITY_RIB_LAND_MM > cavityHalfSpanMm) {
        context.addIssue({
            code: 'custom',
            path: [
                'rigidityRibs',
                ribs.wallBottomGussetMm > ribs.projectionMm ? 'wallBottomGussetMm' : 'projectionMm',
            ],
            message: 'Inside rib projection or gusset leaves no usable cavity.',
        });
    }
}

export function validateBottomRibDepth(
    ribs: { enabled: boolean; depthMm: number },
    bottomThicknessMm: number,
    context: z.RefinementCtx,
): void {
    if (ribs.enabled && ribs.depthMm > bottomThicknessMm - MIN_REMAINING_WALL_MM) {
        context.addIssue({
            code: 'custom',
            path: ['bottomRibs', 'depthMm'],
            message: `Rib depth must leave at least ${MIN_REMAINING_WALL_MM} mm of floor.`,
        });
    }
}

export function validateBottomRibSpacing(
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
        });
    }
}

export const edgeTreatmentSchema = z.strictObject({
    style: z.enum(['none', 'rounded', 'chamfered']),
    sizeMm: z.number().positive().max(100),
});

export type EdgeTreatment = z.infer<typeof edgeTreatmentSchema>;

export const DEFAULT_EDGE_TREATMENT: EdgeTreatment = { style: 'rounded', sizeMm: 1 };

export function validateTextureSafety(
    texture: TextureConfig,
    wallThicknessMm: number,
    context: z.RefinementCtx,
): void {
    if (texture.kind === 'smooth') return;
    if (
        texture.reliefMode === 'recess' &&
        texture.depthMm > wallThicknessMm - MIN_REMAINING_WALL_MM
    ) {
        context.addIssue({
            code: 'custom',
            path: ['texture', 'depthMm'],
            message: `Recess depth must leave at least ${MIN_REMAINING_WALL_MM} mm of wall.`,
        });
    }
}

import { z } from 'zod';
import { MIN_REMAINING_WALL_MM } from '../../../domain/shared/constants';
import {
    DEFAULT_EDGE_TREATMENT,
    bottomRibsBaseSchema,
    edgeTreatmentSchema,
    rigidityRibsBaseSchema,
    validateBottomRibDepth,
    validateBottomRibSpacing,
    validateRigidityProfile,
} from '../../../domain/shared/features';
import { TEXTURE_REGISTRY, textureSchema } from '../../../domain/shared/textures';

export const drawerBottomRibsSchema = bottomRibsBaseSchema.extend({
    pattern: z.literal('grid'),
    xCount: z.number().int().min(0).max(100),
    yCount: z.number().int().min(0).max(100),
});

export type DrawerBottomRibs = z.infer<typeof drawerBottomRibsSchema>;

export const drawerRigidityRibsSchema = rigidityRibsBaseSchema.extend({
    pattern: z.literal('vertical'),
    frontBackCount: z.number().int().min(0).max(60),
    sideCount: z.number().int().min(0).max(60),
});

export type DrawerRigidityRibs = z.infer<typeof drawerRigidityRibsSchema>;

export const DEFAULT_DRAWER_RIGIDITY_RIBS: DrawerRigidityRibs = {
    enabled: true,
    placement: 'inside',
    pattern: 'vertical',
    projectionMm: 2,
    baseWidthMm: 4,
    wallBottomGussetMm: 3,
    frontBackCount: 3,
    sideCount: 2,
};

export const DEFAULT_DRAWER_BOTTOM_RIBS: DrawerBottomRibs = {
    enabled: true,
    pattern: 'grid',
    xCount: 5,
    yCount: 5,
    depthMm: 2,
    widthMm: 3,
};

export const drawerTextureWallsSchema = z.strictObject({
    front: z.boolean(),
    sides: z.boolean(),
    back: z.boolean(),
});

export type DrawerTextureWalls = z.infer<typeof drawerTextureWallsSchema>;

export const DEFAULT_DRAWER_TEXTURE_WALLS: DrawerTextureWalls = {
    front: true,
    sides: true,
    back: true,
};

export const drawerParametersSchema = z
    .strictObject({
        widthMm: z.number().min(30).max(1000),
        depthMm: z.number().min(30).max(1000),
        heightMm: z.number().min(20).max(1000),
        wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(20),
        bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
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
        if (value.wallThicknessMm * 2 >= Math.min(value.widthMm, value.depthMm))
            context.addIssue({
                code: 'custom',
                path: ['wallThicknessMm'],
                message: 'Wall thickness leaves no usable interior.',
            });
        if (value.bottomThicknessMm >= value.heightMm)
            context.addIssue({
                code: 'custom',
                path: ['bottomThicknessMm'],
                message: 'Bottom must be thinner than the drawer height.',
            });
        if (value.handleWidthMm > value.widthMm - 4 * value.wallThicknessMm)
            context.addIssue({
                code: 'custom',
                path: ['handleWidthMm'],
                message: 'Handle is too wide for this drawer.',
            });
        if (value.handleStyle === 'projecting' && value.handleHeightMm > value.heightMm)
            context.addIssue({
                code: 'custom',
                path: ['handleHeightMm'],
                message: 'Handle is taller than the drawer.',
            });
        if (value.handleStyle === 'projecting' && value.handleDepthMm > value.handleHeightMm)
            context.addIssue({
                code: 'custom',
                path: ['handleDepthMm'],
                message:
                    'Projection must not exceed handle height so the underside remains printable.',
            });
        if (
            value.handleStyle === 'recessed' &&
            value.handleHeightMm + 2 * value.wallThicknessMm > value.heightMm
        )
            context.addIssue({
                code: 'custom',
                path: ['handleHeightMm'],
                message: 'Opening and its reinforcing rib are taller than the drawer.',
            });
        if (
            value.handleStyle === 'recessed' &&
            value.handleDepthMm + value.wallThicknessMm > value.depthMm - 2 * value.wallThicknessMm
        )
            context.addIssue({
                code: 'custom',
                path: ['handleDepthMm'],
                message: 'Reinforcing rib is too deep for this drawer.',
            });
        if (
            value.handleStyle === 'recessed' &&
            value.handleCornerRadiusMm > Math.min(value.handleWidthMm, value.handleHeightMm) / 2
        )
            context.addIssue({
                code: 'custom',
                path: ['handleCornerRadiusMm'],
                message: 'Corner radius cannot exceed half of the smaller opening dimension.',
            });
        validateBottomRibDepth(value.bottomRibs, value.bottomThicknessMm, context);
        validateRigidityProfile(
            value.rigidityRibs,
            value.heightMm - value.bottomThicknessMm,
            Math.min(value.widthMm, value.depthMm) / 2 - value.wallThicknessMm,
            context,
        );
        if (value.rigidityRibs.enabled) {
            if (value.rigidityRibs.frontBackCount + value.rigidityRibs.sideCount < 1)
                context.addIssue({
                    code: 'custom',
                    path: ['rigidityRibs', 'frontBackCount'],
                    message: 'An enabled drawer must have at least one rigidity rib.',
                });
            if (value.rigidityRibs.frontBackCount > 0)
                validateBottomRibSpacing(
                    value.rigidityRibs.baseWidthMm,
                    (value.widthMm - 2 * value.wallThicknessMm) /
                        (value.rigidityRibs.frontBackCount + 1),
                    ['rigidityRibs', 'baseWidthMm'],
                    context,
                    'ribs',
                );
            if (value.rigidityRibs.sideCount > 0)
                validateBottomRibSpacing(
                    value.rigidityRibs.baseWidthMm,
                    (value.depthMm - 2 * value.wallThicknessMm) /
                        (value.rigidityRibs.sideCount + 1),
                    ['rigidityRibs', 'baseWidthMm'],
                    context,
                    'ribs',
                );
        }
        if (value.bottomRibs.enabled) {
            if (value.bottomRibs.xCount + value.bottomRibs.yCount < 1) {
                context.addIssue({
                    code: 'custom',
                    path: ['bottomRibs', 'xCount'],
                    message: 'An enabled drawer must have at least one rib direction.',
                });
            }
            if (value.bottomRibs.xCount > 0) {
                validateBottomRibSpacing(
                    value.bottomRibs.widthMm,
                    value.depthMm / (value.bottomRibs.xCount + 1),
                    ['bottomRibs', 'widthMm'],
                    context,
                );
            }
            if (value.bottomRibs.yCount > 0) {
                validateBottomRibSpacing(
                    value.bottomRibs.widthMm,
                    value.widthMm / (value.bottomRibs.yCount + 1),
                    ['bottomRibs', 'widthMm'],
                    context,
                );
            }
        }
    });

export type DrawerParameters = z.infer<typeof drawerParametersSchema>;

export const drawerConfigSchema = z.strictObject({
    type: z.literal('drawer'),
    parameters: drawerParametersSchema,
    texture: textureSchema,
    textureWalls: drawerTextureWallsSchema,
});

export type DrawerConfig = z.infer<typeof drawerConfigSchema>;

export const DEFAULT_DRAWER: DrawerConfig = {
    type: 'drawer',
    parameters: {
        widthMm: 120,
        depthMm: 90,
        heightMm: 50,
        wallThicknessMm: 2,
        bottomThicknessMm: 3,
        edgeTreatment: { ...DEFAULT_EDGE_TREATMENT },
        handleStyle: 'projecting',
        handleWidthMm: 50,
        handleHeightMm: 12,
        handleDepthMm: 12,
        handleCornerRadiusMm: 3,
        handlePositionPercent: 0,
        bottomRibs: { ...DEFAULT_DRAWER_BOTTOM_RIBS },
        rigidityRibs: { ...DEFAULT_DRAWER_RIGIDITY_RIBS },
    },
    texture: { ...TEXTURE_REGISTRY.ribs.create(), scaleMm: 7 },
    textureWalls: { ...DEFAULT_DRAWER_TEXTURE_WALLS },
};

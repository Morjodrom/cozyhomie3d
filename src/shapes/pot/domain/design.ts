import { z } from 'zod';
import { MIN_REMAINING_WALL_MM, MIN_RIGIDITY_RIB_LAND_MM } from '../../../domain/shared/constants';
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
import { cavityFloorRadius, drainageHolesSchema, generateDrainageLayout } from './drainage';

export const potBottomRibsSchema = bottomRibsBaseSchema.extend({
    pattern: z.literal('concentric'),
    count: z.number().int().min(0).max(100),
});

export type PotBottomRibs = z.infer<typeof potBottomRibsSchema>;

export const potRigidityRibsSchema = rigidityRibsBaseSchema.extend({
    pattern: z.literal('hoops'),
    count: z.number().int().min(0).max(60),
});

export type PotRigidityRibs = z.infer<typeof potRigidityRibsSchema>;

export const DEFAULT_POT_RIGIDITY_RIBS: PotRigidityRibs = {
    enabled: true,
    placement: 'inside',
    pattern: 'hoops',
    projectionMm: 2,
    baseWidthMm: 4,
    wallBottomGussetMm: 3,
    count: 2,
};

export const DEFAULT_POT_BOTTOM_RIBS: PotBottomRibs = {
    enabled: true,
    pattern: 'concentric',
    count: 3,
    depthMm: 2,
    widthMm: 3,
};

export const potParametersSchema = z
    .strictObject({
        heightMm: z.number().min(30).max(1000),
        bottomDiameterMm: z.number().min(30).max(1000),
        topDiameterMm: z.number().min(30).max(1000),
        wallThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(20),
        bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
        edgeTreatment: edgeTreatmentSchema,
        drainageHoleRounding: z.strictObject({
            enabled: z.boolean(),
            radiusMm: z.number().positive().max(25),
        }),
        drainageHoles: drainageHolesSchema,
        bottomRibs: potBottomRibsSchema,
        rigidityRibs: potRigidityRibsSchema,
    })
    .superRefine((value, context) => {
        const minRadius = Math.min(value.bottomDiameterMm, value.topDiameterMm) / 2;
        if (value.wallThicknessMm >= minRadius)
            context.addIssue({
                code: 'custom',
                path: ['wallThicknessMm'],
                message: 'Wall thickness leaves no usable cavity.',
            });
        if (value.bottomThicknessMm >= value.heightMm)
            context.addIssue({
                code: 'custom',
                path: ['bottomThicknessMm'],
                message: 'Bottom must be thinner than the pot height.',
            });
        if (value.drainageHoleRounding.enabled) {
            for (const hole of value.drainageHoles.filter((candidate) => candidate.enabled)) {
                const availableDepth = hole.countersink
                    ? value.bottomThicknessMm - hole.countersink.depthMm
                    : value.bottomThicknessMm / 2;
                if (
                    value.drainageHoleRounding.radiusMm >
                    Math.min(hole.diameterMm / 2, availableDepth)
                ) {
                    context.addIssue({
                        code: 'custom',
                        path: ['drainageHoleRounding', 'radiusMm'],
                        message:
                            'Drainage rounding is too large for the hole diameter or available bottom thickness.',
                    });
                    break;
                }
            }
        }
        validateBottomRibDepth(value.bottomRibs, value.bottomThicknessMm, context);
        validateRigidityProfile(
            value.rigidityRibs,
            value.heightMm - value.bottomThicknessMm,
            minRadius - value.wallThicknessMm,
            context,
        );
        if (value.rigidityRibs.enabled) {
            if (value.rigidityRibs.count < 1)
                context.addIssue({
                    code: 'custom',
                    path: ['rigidityRibs', 'count'],
                    message: 'An enabled pot must have at least one hoop.',
                });
            const lowestCenter =
                value.bottomThicknessMm +
                value.rigidityRibs.wallBottomGussetMm +
                value.rigidityRibs.baseWidthMm +
                MIN_RIGIDITY_RIB_LAND_MM;
            const highestCenter = value.heightMm - value.rigidityRibs.baseWidthMm / 2;
            const pitch = (highestCenter - lowestCenter) / value.rigidityRibs.count;
            if (
                value.rigidityRibs.count > 1 &&
                pitch < value.rigidityRibs.baseWidthMm + MIN_RIGIDITY_RIB_LAND_MM
            ) {
                context.addIssue({
                    code: 'custom',
                    path: ['rigidityRibs', 'count'],
                    message: `Hoops must leave at least ${MIN_RIGIDITY_RIB_LAND_MM} mm between neighboring ribs.`,
                });
            }
        }
        if (value.bottomRibs.enabled) {
            if (value.bottomRibs.count < 1) {
                context.addIssue({
                    code: 'custom',
                    path: ['bottomRibs', 'count'],
                    message: 'An enabled pot must have at least one concentric rib.',
                });
            } else {
                validateBottomRibSpacing(
                    value.bottomRibs.widthMm,
                    value.bottomDiameterMm / 2 / (value.bottomRibs.count + 1),
                    ['bottomRibs', 'widthMm'],
                    context,
                );
            }
        }
    });

export type PotParameters = z.infer<typeof potParametersSchema>;

export const potConfigSchema = z.strictObject({
    type: z.literal('pot'),
    parameters: potParametersSchema,
    texture: textureSchema,
});

export type PotConfig = z.infer<typeof potConfigSchema>;

export const DEFAULT_POT: PotConfig = {
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
            cavityFloorRadius: cavityFloorRadius({
                heightMm: 100,
                bottomDiameterMm: 100,
                topDiameterMm: 120,
                wallThicknessMm: 2,
                bottomThicknessMm: 3,
            }),
            wallThicknessMm: 2,
        }),
    },
    texture: TEXTURE_REGISTRY.ribs.create(),
};

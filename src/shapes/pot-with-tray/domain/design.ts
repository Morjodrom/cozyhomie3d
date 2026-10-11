import { z } from 'zod';
import {
    MIN_BOTTOM_RIB_LAND_MM,
    MIN_REMAINING_WALL_MM,
    MIN_TEXTURE_FEATURE_MM,
} from '../../../domain/shared/constants';
import {
    DEFAULT_BED_ADHESION_BEAMS,
    bedAdhesionBeamsSchema,
    validateBottomRibSpacing,
} from '../../../domain/shared/features';
import { textureSchema } from '../../../domain/shared/textures';
import { DEFAULT_POT, type PotParameters, potParametersSchema } from '../../pot/domain/design';
import { cavityFloorRadius } from '../../pot/domain/drainage';
import {
    DEFAULT_TRAY_PARAMETERS,
    type TrayConnectorDimensions,
    type TrayParameters,
    trayParametersSchema,
} from '../../tray/domain/design';

export function trayConnectorDimensions(
    parameters: PotParameters,
    tray: TrayParameters,
): TrayConnectorDimensions {
    const bottomRadiusMm = parameters.bottomDiameterMm / 2;
    const slope =
        (parameters.topDiameterMm - parameters.bottomDiameterMm) / 2 / parameters.heightMm;
    const tongueThicknessMm = tray.engagementWidthMm;
    // Keep the connector behind the full nominal pot wall. A recessed texture
    // may remove all but MIN_REMAINING_WALL_MM from that wall; placing the groove
    // only MIN_REMAINING_WALL_MM from the untextured exterior can therefore cut
    // the floor loose at the seam.
    const grooveOuterRadiusMm = bottomRadiusMm - parameters.wallThicknessMm;
    const grooveInnerRadiusMm = grooveOuterRadiusMm - tongueThicknessMm - 2 * tray.fitClearanceMm;
    const tongueOuterRadiusMm = grooveOuterRadiusMm - tray.fitClearanceMm;
    return {
        trayBottomRadiusMm: bottomRadiusMm - slope * tray.heightMm,
        tongueThicknessMm,
        tongueInnerRadiusMm: tongueOuterRadiusMm - tongueThicknessMm,
        tongueOuterRadiusMm,
        tongueHeightMm: tray.engagementDepthMm - tray.fitClearanceMm,
        grooveInnerRadiusMm,
        grooveOuterRadiusMm,
        bottomRibRadiusMm: grooveInnerRadiusMm - MIN_BOTTOM_RIB_LAND_MM,
    };
}

export function validatePotWithTray(
    value: { parameters: PotParameters; tray: TrayParameters },
    context: z.RefinementCtx,
): void {
    const { parameters, tray } = value;
    const connector = trayConnectorDimensions(parameters, tray);
    const minimumTrayRadius = Math.min(
        parameters.bottomDiameterMm / 2,
        connector.trayBottomRadiusMm,
    );
    if (connector.trayBottomRadiusMm <= tray.wallThicknessMm + MIN_REMAINING_WALL_MM) {
        context.addIssue({
            code: 'custom',
            path: ['tray', 'heightMm'],
            message: 'The projected tray bottom leaves no usable cavity.',
        });
    }
    if (tray.bottomThicknessMm >= tray.heightMm) {
        context.addIssue({
            code: 'custom',
            path: ['tray', 'bottomThicknessMm'],
            message: 'Tray bottom must be thinner than the tray height.',
        });
    }
    if (tray.engagementDepthMm > parameters.bottomThicknessMm - MIN_REMAINING_WALL_MM) {
        context.addIssue({
            code: 'custom',
            path: ['tray', 'engagementDepthMm'],
            message: `Connector depth must leave at least ${MIN_REMAINING_WALL_MM} mm of pot floor.`,
        });
    }
    if (connector.tongueHeightMm < MIN_TEXTURE_FEATURE_MM) {
        context.addIssue({
            code: 'custom',
            path: ['tray', 'fitClearanceMm'],
            message: `Fit clearance must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of tongue height.`,
        });
    }
    if (
        connector.grooveInnerRadiusMm <= MIN_REMAINING_WALL_MM ||
        minimumTrayRadius <= tray.wallThicknessMm
    ) {
        context.addIssue({
            code: 'custom',
            path: ['tray', 'wallThicknessMm'],
            message: 'Tray wall and connector do not fit inside the projected profile.',
        });
    }
    if (parameters.rigidityRibs.enabled && parameters.rigidityRibs.placement === 'outside') {
        context.addIssue({
            code: 'custom',
            path: ['parameters', 'rigidityRibs', 'placement'],
            message: 'Pot + tray requires inside rigidity ribs to keep the seam flush.',
        });
    }

    const cavityRadius = cavityFloorRadius(parameters);
    for (const hole of parameters.drainageHoles.filter((candidate) => candidate.enabled)) {
        const holeRadius = Math.max(hole.diameterMm, hole.countersink?.diameterMm ?? 0) / 2;
        const centerRadius = Math.hypot(hole.position.x, hole.position.y) * cavityRadius;
        if (centerRadius + holeRadius + MIN_BOTTOM_RIB_LAND_MM > connector.grooveInnerRadiusMm) {
            context.addIssue({
                code: 'custom',
                path: ['parameters', 'drainageHoles'],
                message: 'Drainage holes must stay inside the tray connector ring.',
            });
            break;
        }
    }
    if (parameters.bottomRibs.enabled && parameters.bottomRibs.count > 0) {
        validateBottomRibSpacing(
            parameters.bottomRibs.widthMm,
            connector.bottomRibRadiusMm / (parameters.bottomRibs.count + 1),
            ['parameters', 'bottomRibs', 'widthMm'],
            context,
        );
    }
}

export const potWithTrayConfigSchema = z
    .strictObject({
        type: z.literal('pot-with-tray'),
        parameters: potParametersSchema,
        tray: trayParametersSchema,
        bedAdhesionBeams: bedAdhesionBeamsSchema,
        texture: textureSchema,
    })
    .superRefine(validatePotWithTray);

export type PotWithTrayConfig = z.infer<typeof potWithTrayConfigSchema>;

export const DEFAULT_POT_WITH_TRAY: PotWithTrayConfig = {
    ...DEFAULT_POT,
    type: 'pot-with-tray',
    parameters: {
        ...DEFAULT_POT.parameters,
        drainageHoles:
            DEFAULT_POT.type === 'pot'
                ? DEFAULT_POT.parameters.drainageHoles.map((hole) => ({
                      ...hole,
                      position: { ...hole.position },
                  }))
                : [],
        bottomRibs: { ...DEFAULT_POT.parameters.bottomRibs },
        rigidityRibs: { ...DEFAULT_POT.parameters.rigidityRibs },
        edgeTreatment: { ...DEFAULT_POT.parameters.edgeTreatment },
        drainageHoleRounding: { ...DEFAULT_POT.parameters.drainageHoleRounding },
    },
    tray: { ...DEFAULT_TRAY_PARAMETERS },
    bedAdhesionBeams: { ...DEFAULT_BED_ADHESION_BEAMS },
};

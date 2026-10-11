import { z } from 'zod';
import { MIN_REMAINING_WALL_MM, MIN_TEXTURE_FEATURE_MM } from '../../../domain/shared/constants';

export const MIN_TRAY_ENGAGEMENT_WIDTH_MM = 1.2;
export const MAX_TRAY_ENGAGEMENT_WIDTH_MM = 25;

export const trayParametersSchema = z
    .strictObject({
        heightMm: z.number().min(8).max(1000),
        wallThicknessMm: z.number().min(MIN_TRAY_ENGAGEMENT_WIDTH_MM).max(20),
        bottomThicknessMm: z.number().min(MIN_REMAINING_WALL_MM).max(30),
        engagementWidthMm: z
            .number()
            .min(MIN_TRAY_ENGAGEMENT_WIDTH_MM)
            .max(MAX_TRAY_ENGAGEMENT_WIDTH_MM),
        engagementDepthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(25),
        fitClearanceMm: z.number().min(0.1).max(2),
        previewGapMm: z.number().min(0).max(500),
    })
    .superRefine((value, context) => {
        if (value.engagementWidthMm > value.wallThicknessMm) {
            context.addIssue({
                code: 'custom',
                path: ['engagementWidthMm'],
                message: 'Engagement width must not exceed tray wall thickness.',
            });
        }
    });

export type TrayParameters = z.infer<typeof trayParametersSchema>;

export type TrayConnectorDimensions = {
    trayBottomRadiusMm: number;
    tongueThicknessMm: number;
    tongueInnerRadiusMm: number;
    tongueOuterRadiusMm: number;
    tongueHeightMm: number;
    grooveInnerRadiusMm: number;
    grooveOuterRadiusMm: number;
    bottomRibRadiusMm: number;
};

export const DEFAULT_TRAY_PARAMETERS: TrayParameters = {
    heightMm: 18,
    wallThicknessMm: 2,
    bottomThicknessMm: 3,
    engagementWidthMm: 2,
    engagementDepthMm: 1.5,
    fitClearanceMm: 0.25,
    previewGapMm: 12,
};

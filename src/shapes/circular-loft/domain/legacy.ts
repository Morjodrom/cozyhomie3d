import { z } from 'zod';
import {
    circularLoftConfigSchema,
    circularLoftOffsetFromCenter,
    validateCircularLoftParameters,
} from './design';

const legacyCircleSchema = z.strictObject({
    diameterMm: z.number().finite().nonnegative(),
    xMm: z.number().finite(),
    yMm: z.number().finite(),
});

/** Read-only compatibility boundary; new configurations never carry Cartesian offsets. */
export const legacyCircularLoftConfigSchema = z
    .strictObject({
        type: z.literal('circular-loft'),
        parameters: z
            .strictObject({
                sections: z
                    .array(z.strictObject({ circles: z.array(legacyCircleSchema).min(1) }))
                    .min(2),
                gapsMm: z.array(z.number().finite().nonnegative()),
            })
            .superRefine(validateCircularLoftParameters),
    })
    .transform((config) => ({
        ...config,
        parameters: {
            ...config.parameters,
            sections: config.parameters.sections.map((section) => ({
                circles: section.circles.map((circle) => ({
                    diameterMm: circle.diameterMm,
                    ...circularLoftOffsetFromCenter(circle.xMm, circle.yMm),
                })),
            })),
        },
    }))
    .pipe(circularLoftConfigSchema);

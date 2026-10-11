import { z } from 'zod';

export const MIN_CIRCULAR_LOFT_POSITIVE_GAP_MM = 0.0001;

export const circularLoftCircleSchema = z.strictObject({
    diameterMm: z.number().finite().nonnegative(),
    xMm: z.number().finite(),
    yMm: z.number().finite(),
});

export type CircularLoftCircle = z.infer<typeof circularLoftCircleSchema>;

export const circularLoftSectionSchema = z.strictObject({
    circles: z.array(circularLoftCircleSchema).min(1),
});

export type CircularLoftSection = z.infer<typeof circularLoftSectionSchema>;

export const circularLoftParametersSchema = z
    .strictObject({
        sections: z.array(circularLoftSectionSchema).min(2),
        gapsMm: z.array(z.number().finite().nonnegative()),
    })
    .superRefine((value, context) => {
        const expectedCircleCount = value.sections[0]?.circles.length;
        for (let sectionIndex = 0; sectionIndex < value.sections.length; sectionIndex += 1) {
            const section = value.sections[sectionIndex];
            if (section.circles.length !== expectedCircleCount) {
                context.addIssue({
                    code: 'custom',
                    path: ['sections', sectionIndex, 'circles'],
                    message: 'Every section must contain the same number of circles.',
                });
            }
            for (let circleIndex = 0; circleIndex < section.circles.length; circleIndex += 1) {
                const circle = section.circles[circleIndex];
                const isDeepestVoidBoundary =
                    circleIndex === section.circles.length - 1 && circleIndex % 2 === 1;
                if (circle.diameterMm === 0 && !isDeepestVoidBoundary) {
                    context.addIssue({
                        code: 'custom',
                        path: ['sections', sectionIndex, 'circles', circleIndex, 'diameterMm'],
                        message: 'Only the deepest void boundary may have a zero diameter.',
                    });
                }
            }
            for (let circleIndex = 1; circleIndex < section.circles.length; circleIndex += 1) {
                const outer = section.circles[circleIndex - 1];
                const inner = section.circles[circleIndex];
                const centerDistance = Math.hypot(inner.xMm - outer.xMm, inner.yMm - outer.yMm);
                if (centerDistance + inner.diameterMm / 2 >= outer.diameterMm / 2) {
                    context.addIssue({
                        code: 'custom',
                        path: ['sections', sectionIndex, 'circles', circleIndex],
                        message: 'Each inner circle must fit strictly inside the preceding circle.',
                    });
                }
            }
        }

        if (value.gapsMm.length !== value.sections.length - 1) {
            context.addIssue({
                code: 'custom',
                path: ['gapsMm'],
                message: 'Provide exactly one gap between each pair of adjacent sections.',
            });
            return;
        }
        if (!Number.isFinite(value.gapsMm.reduce((heightMm, gapMm) => heightMm + gapMm, 0))) {
            context.addIssue({
                code: 'custom',
                path: ['gapsMm'],
                message: 'The total height must be finite.',
            });
        }
        if (value.gapsMm[0] === 0) {
            context.addIssue({
                code: 'custom',
                path: ['gapsMm', 0],
                message: 'The first gap must be positive.',
            });
        }
        const lastIndex = value.gapsMm.length - 1;
        if (value.gapsMm[lastIndex] === 0) {
            context.addIssue({
                code: 'custom',
                path: ['gapsMm', lastIndex],
                message: 'The last gap must be positive.',
            });
        }
        for (let index = 1; index < value.gapsMm.length; index += 1) {
            if (value.gapsMm[index - 1] === 0 && value.gapsMm[index] === 0) {
                context.addIssue({
                    code: 'custom',
                    path: ['gapsMm', index],
                    message: 'Zero-length steps cannot be consecutive.',
                });
            }
        }
    });

export type CircularLoftParameters = z.infer<typeof circularLoftParametersSchema>;

export const circularLoftConfigSchema = z.strictObject({
    type: z.literal('circular-loft'),
    parameters: circularLoftParametersSchema,
});

export type CircularLoftConfig = z.infer<typeof circularLoftConfigSchema>;

export const DEFAULT_CIRCULAR_LOFT: CircularLoftConfig = {
    type: 'circular-loft',
    parameters: {
        sections: [
            { circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }] },
            { circles: [{ diameterMm: 60, xMm: 0, yMm: 0 }] },
        ],
        gapsMm: [60],
    },
};

export function circularLoftPositiveIntervalCount(parameters: CircularLoftParameters): number {
    return parameters.gapsMm.filter((gapMm) => gapMm > 0).length;
}

/**
 * Returns the smallest radial clearance between immediately nested circles.
 * Linear interpolation preserves this lower bound through every positive interval.
 */
export function circularLoftMinimumClearanceMm(parameters: CircularLoftParameters): number {
    let minimum = Number.POSITIVE_INFINITY;
    for (const section of parameters.sections) {
        for (let index = 1; index < section.circles.length; index += 1) {
            const outer = section.circles[index - 1];
            const inner = section.circles[index];
            minimum = Math.min(
                minimum,
                outer.diameterMm / 2 -
                    inner.diameterMm / 2 -
                    Math.hypot(inner.xMm - outer.xMm, inner.yMm - outer.yMm),
            );
        }
    }
    return minimum;
}

/**
 * Uses a shared angular grid for all nested circles. The outer polygon's chord
 * inset stays below half the analytical clearance, so its facets cannot cut an
 * almost-touching inner circle even when their centers are offset.
 */
export function circularLoftRequiredSegments(
    parameters: CircularLoftParameters,
    minimumSegments: number,
): number {
    if (parameters.sections[0].circles.length < 2) return minimumSegments;
    const clearanceMm = circularLoftMinimumClearanceMm(parameters);
    let required = minimumSegments;
    for (const section of parameters.sections) {
        for (let index = 1; index < section.circles.length; index += 1) {
            const outerRadiusMm = section.circles[index - 1].diameterMm / 2;
            const sagittaMm = clearanceMm / 2;
            if (sagittaMm >= outerRadiusMm) continue;
            required = Math.max(
                required,
                Math.ceil(Math.PI / Math.acos(1 - sagittaMm / outerRadiusMm)),
            );
        }
    }
    return required;
}

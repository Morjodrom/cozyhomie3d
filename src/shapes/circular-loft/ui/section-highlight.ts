import type { CircularLoftConfig } from '../domain/design';
import { circularLoftCircleCenter } from '../domain/design';
import type { CircularLoftSectionHighlight } from '../../../ui/Viewport';

/** Use the successful preview snapshot, never an invalid or pending editing draft. */
export function circularLoftSectionHighlight(
    config: CircularLoftConfig,
    sectionIndex: number | null,
): CircularLoftSectionHighlight | undefined {
    if (sectionIndex === null || !Number.isInteger(sectionIndex)) return undefined;
    const section = config.parameters.sections[sectionIndex];
    if (!section) return undefined;
    const zMm = config.parameters.gapsMm.slice(0, sectionIndex).reduce((sum, gap) => sum + gap, 0);
    if (!Number.isFinite(Math.fround(zMm))) return undefined;
    const gapMm = config.parameters.gapsMm[sectionIndex - 1];
    if (sectionIndex > 0 && gapMm > 0) {
        return {
            sectionIndex,
            span: {
                lowerZMm: config.parameters.gapsMm
                    .slice(0, sectionIndex - 1)
                    .reduce((sum, gap) => sum + gap, 0),
                upperZMm: zMm,
            },
            contours: [],
        };
    }
    return {
        sectionIndex,
        contours: section.circles.map((circle, circleIndex) => ({
            ...circularLoftCircleCenter(circle),
            diameterMm: circle.diameterMm,
            zMm,
            sectionIndex,
            circleIndex,
        })),
    };
}

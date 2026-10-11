import { describe, expect, it } from 'vitest';
import { DEFAULT_CIRCULAR_LOFT, type CircularLoftConfig } from '../domain/design';
import { circularLoftSectionHighlight } from './section-highlight';

const config: CircularLoftConfig = {
    type: 'circular-loft',
    parameters: {
        sections: Array.from({ length: 4 }, () => ({
            circles: [
                { diameterMm: 60, offsetDistanceMm: 10, offsetAngleDeg: 90 },
                { diameterMm: 0, offsetDistanceMm: 10, offsetAngleDeg: 0 },
            ],
        })),
        gapsMm: [20, 0, 30],
    },
};

describe('active circular loft sections', () => {
    it.each([
        { index: 1, lower: 0, upper: 20 },
        { index: 3, lower: 20, upper: 50 },
    ])('selects only the incoming positive span for section $index', ({ index, lower, upper }) => {
        expect(circularLoftSectionHighlight(config, index)).toEqual({
            sectionIndex: index,
            span: { lowerZMm: lower, upperZMm: upper },
            contours: [],
        });
    });
    it.each([
        { index: 0, z: 0 },
        { index: 2, z: 20 },
    ])('uses all contours for section $index without an incoming volume', ({ index, z }) => {
        const highlight = circularLoftSectionHighlight(config, index)!;
        expect(highlight.span).toBeUndefined();
        expect(highlight.contours).toEqual([
            { sectionIndex: index, circleIndex: 0, diameterMm: 60, xMm: 10, yMm: 0, zMm: z },
            { sectionIndex: index, circleIndex: 1, diameterMm: 0, xMm: 0, yMm: 10, zMm: z },
        ]);
    });
    it.each([null, -1, 4, 0.5, NaN])('ignores missing or invalid selection %s', (index) => {
        expect(circularLoftSectionHighlight(config, index)).toBeUndefined();
    });
    it('leaves the preview configuration unchanged', () => {
        const original = structuredClone(DEFAULT_CIRCULAR_LOFT);
        circularLoftSectionHighlight(DEFAULT_CIRCULAR_LOFT, 1);
        expect(DEFAULT_CIRCULAR_LOFT).toEqual(original);
    });
});

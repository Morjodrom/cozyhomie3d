import { describe, expect, it } from 'vitest';
import { roundedRectangleContour } from './rounded-rectangle';

describe('geometry generation', () => {
    it('creates deterministic square, rounded, and maximum-radius opening contours', () => {
        expect(roundedRectangleContour(50, 12, 0, 4)).toEqual([
            [-25, -6],
            [25, -6],
            [25, 6],
            [-25, 6],
        ]);

        const rounded = roundedRectangleContour(50, 12, 3, 4);
        expect(rounded).toHaveLength(16);
        expect(rounded[0][0]).toBeCloseTo(25, 8);
        expect(rounded[0][1]).toBeCloseTo(3, 8);
        expect(rounded.every(([x, z]) => Math.abs(x) <= 25 && Math.abs(z) <= 6)).toBe(true);

        const maximum = roundedRectangleContour(50, 12, 6, 4);
        expect(maximum).toHaveLength(16);
        expect(maximum[0]).toEqual([25, 0]);
    });
});

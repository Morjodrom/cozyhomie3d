import { describe, expect, it } from 'vitest';
import { concentricRibRadii, evenlySpacedCenterlines, roundedVProfile } from './bottom-ribs';

describe('geometry generation', () => {
    it('places straight and concentric rib centerlines in equal interior gaps', () => {
        expect(evenlySpacedCenterlines(120, 5)).toEqual([-40, -20, 0, 20, 40]);
        expect(evenlySpacedCenterlines(90, 2)).toEqual([-15, 15]);
        expect(evenlySpacedCenterlines(90, 0)).toEqual([]);
        expect(concentricRibRadii(50, 3)).toEqual([12.5, 25, 37.5]);
    });

    it('builds a symmetric rounded V profile at the exact requested width and depth', () => {
        const profile = roundedVProfile(3, 2, 5);
        const surface = profile.filter(([, z]) => z >= 0);
        const xValues = surface.map(([x]) => x);
        const zValues = surface.map(([, z]) => z);

        expect(Math.min(...xValues)).toBeCloseTo(-1.5, 10);
        expect(Math.max(...xValues)).toBeCloseTo(1.5, 10);
        expect(Math.max(...zValues)).toBeCloseTo(2, 10);
        for (const [x, z] of surface) {
            const mirror = surface.find(([otherX]) => Math.abs(otherX + x) < 1e-10);
            expect(mirror?.[1]).toBeCloseTo(z, 10);
        }
    });
});

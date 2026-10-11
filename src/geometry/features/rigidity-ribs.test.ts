import { describe, expect, it } from 'vitest';
import {
    rigidityRibCenterlines,
    roundedRibProfile,
    topAnchoredEvenlySpacedHoopElevations,
} from './rigidity-ribs';

describe('geometry generation', () => {
    it('builds a strongly rounded rigidity profile at the exact requested width and projection', () => {
        const profile = roundedRibProfile(4, 2, 5);

        expect(profile).toHaveLength(11);
        expect(profile[0]).toEqual([-2, 0]);
        expect(profile[5]).toEqual([0, 2]);
        expect(profile[10][0]).toBeCloseTo(2, 10);
        expect(profile[10][1]).toBeCloseTo(0, 10);
        for (const [offset, projection] of profile) {
            const mirror = profile.find(([otherOffset]) => Math.abs(otherOffset + offset) < 1e-10);
            expect(mirror?.[1]).toBeCloseTo(projection, 10);
        }
        expect(profile[1][1]).toBeLessThan(0.4);
        expect(profile[4][1]).toBeGreaterThan(1.6);
    });

    it('anchors hoops at the top and spaces them evenly above the gusset', () => {
        expect(topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 0)).toEqual([]);
        const hoops = topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 3);
        const low = 3 + 4 + 0.6;
        const high = 100 - 4 / 2;
        const pitch = (high - low) / 3;
        expect(hoops[0]).toBeCloseTo(high);
        expect(hoops[1] - hoops[0]).toBeCloseTo(-pitch);
        expect(hoops[2] - hoops[1]).toBeCloseTo(-pitch);
        const defaultHoops = topAnchoredEvenlySpacedHoopElevations(100, 3, 4, 2, 3);
        const defaultLow = 3 + 3 + 4 + 0.6;
        const defaultHigh = 100 - 4 / 2;
        expect(defaultHoops[0]).toBeCloseTo(defaultHigh);
        expect(defaultHoops[1]).toBeCloseTo(defaultHigh - (defaultHigh - defaultLow) / 2);
        expect(rigidityRibCenterlines(116, 3)).toEqual([-29, 0, 29]);
    });
});

import { createTextureDefault } from '../../domain/shared/textures';
import { describe, expect, it } from 'vitest';
import { textureDisplacement, textureSignal, type SurfaceSample } from './textures';
import { potSample } from '../testing/mesh';

describe('geometry generation', () => {
    it('keeps sampled noise seeded, deterministic, and seamless', () => {
        const texture = createTextureDefault('noise');
        if (texture.kind !== 'noise') throw new Error('Broken texture fixture');
        const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm };
        expect(textureSignal(texture, potSample)).toBeCloseTo(
            textureSignal(texture, potSample),
            12,
        );
        expect(textureDisplacement(texture, potSample)).toBeCloseTo(
            textureDisplacement(texture, seam),
            8,
        );
        expect(textureSignal({ ...texture, seed: texture.seed + 1 }, potSample)).not.toBeCloseTo(
            textureSignal(texture, potSample),
            12,
        );
    });

    it('refuses to raster-sample geometric vector presets', () => {
        for (const kind of ['ribs', 'honeycomb', 'voronoi', 'fractal'] as const) {
            expect(() => textureDisplacement(createTextureDefault(kind), potSample)).toThrow(
                /vector paths/,
            );
        }
    });

    it('samples 3D noise in world space without opening the cylindrical seam', () => {
        const noise = createTextureDefault('noise');
        if (noise.kind !== 'noise') throw new Error('Broken texture fixture');
        const texture = { ...noise, dimensions: '3d' as const };
        const seam: SurfaceSample = { ...potSample, uMm: potSample.perimeterMm };
        expect(textureDisplacement(texture, seam)).toBeCloseTo(
            textureDisplacement(texture, potSample),
            10,
        );
        expect(textureSignal(texture, { ...potSample, xMm: 0, yMm: 50 })).not.toBeCloseTo(
            textureSignal(texture, potSample),
            10,
        );
    });

    it('uses independent texture offsets and suppresses scalar displacement outside the selected band', () => {
        const texture = createTextureDefault('noise');
        if (texture.kind !== 'noise') throw new Error('Broken texture fixture');
        const asymmetric = {
            ...texture,
            bottomOffsetPercent: 20,
            topOffsetPercent: 60,
            bottomFadeMm: 0,
            topFadeMm: 0,
        };

        expect(textureDisplacement(asymmetric, { ...potSample, zMm: 19.99 })).toBe(0);
        expect(textureDisplacement(asymmetric, { ...potSample, zMm: 40 })).toBe(0);
        expect(textureDisplacement(asymmetric, { ...potSample, zMm: 30 })).not.toBe(0);
        expect(
            textureDisplacement(
                { ...asymmetric, bottomOffsetPercent: 60, topOffsetPercent: 40 },
                potSample,
            ),
        ).toBe(0);
    });
});

import { describe, expect, it } from 'vitest';
import { designConfigSchema } from '../../../domain/design';
import { DEFAULT_POT } from './design';

describe('shape design schemas', () => {
    it('validates evenly spaced pot hoops against the neighboring-rib land', () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Broken default fixture');
        const ribs = DEFAULT_POT.parameters.rigidityRibs;
        const accepted = {
            ...DEFAULT_POT,
            parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...ribs, count: 19 } },
        };
        const rejected = {
            ...DEFAULT_POT,
            parameters: { ...DEFAULT_POT.parameters, rigidityRibs: { ...ribs, count: 20 } },
        };

        expect(designConfigSchema.safeParse(accepted).success).toBe(true);
        expect(designConfigSchema.safeParse(rejected).success).toBe(false);
    });

    it('validates canonical drainage hole definitions', () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Expected pot fixture');
        const first = DEFAULT_POT.parameters.drainageHoles[0];
        expect(first).toMatchObject({ shape: 'circle', enabled: true });
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: [{ ...first, position: { x: 1, y: 1 } }],
                },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: [{ ...first, shape: 'slot' }],
                },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: Array.from({ length: 25 }, () => first),
                },
            }).success,
        ).toBe(false);
        expect(
            designConfigSchema.safeParse({
                ...DEFAULT_POT,
                parameters: {
                    ...DEFAULT_POT.parameters,
                    drainageHoles: [{ ...first, countersink: { diameterMm: 10, depthMm: 1 } }],
                },
            }).success,
        ).toBe(true);
    });

    it('rejects a pot without room for its cavity', () => {
        if (DEFAULT_POT.type !== 'pot') throw new Error('Expected pot fixture');
        const parameters = { ...DEFAULT_POT.parameters, wallThicknessMm: 60 };
        expect(designConfigSchema.safeParse({ ...DEFAULT_POT, parameters }).success).toBe(false);
    });
});

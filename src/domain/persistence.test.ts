import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAWER } from '../shapes/drawer/domain/design';
import {
    circularLoftCircleCenter,
    DEFAULT_CIRCULAR_LOFT,
} from '../shapes/circular-loft/domain/design';
import { DEFAULT_POT } from '../shapes/pot/domain/design';
import { DEFAULT_POT_WITH_TRAY } from '../shapes/pot-with-tray/domain/design';
import { loadSession, saveSession } from './persistence';

function createStorage() {
    const values = new Map<string, string>();
    return {
        storage: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: vi.fn((key: string) => {
                values.delete(key);
            }),
        },
    };
}

describe('session persistence', () => {
    it('round-trips the current session contract', () => {
        const { storage } = createStorage();
        const session = { config: DEFAULT_POT, highFidelityPreview: true };

        saveSession(storage, session);

        expect(loadSession(storage)).toEqual(session);
        expect(storage.removeItem).not.toHaveBeenCalled();
    });

    it('deletes invalid stored data', () => {
        const storage = {
            getItem: () => '{bad json',
            removeItem: vi.fn(),
        };

        expect(loadSession(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledOnce();
    });

    it('deletes sessions that do not match the exact current shape', () => {
        const storage = {
            getItem: () =>
                JSON.stringify({
                    config: { ...DEFAULT_POT, unknownField: true },
                    highFidelityPreview: false,
                }),
            removeItem: vi.fn(),
        };

        expect(loadSession(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledOnce();
    });

    it('deletes sessions saved with the removed texture coverage setting', () => {
        if (DEFAULT_POT.texture.kind === 'smooth') throw new Error('Broken texture fixture');
        const {
            bottomOffsetPercent: _bottomOffsetPercent,
            topOffsetPercent: _topOffsetPercent,
            ...legacyTexture
        } = DEFAULT_POT.texture;
        const storage = {
            getItem: () =>
                JSON.stringify({
                    config: { ...DEFAULT_POT, texture: { ...legacyTexture, coveragePercent: 82 } },
                    highFidelityPreview: false,
                }),
            removeItem: vi.fn(),
        };

        expect(loadSession(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledOnce();
    });

    it('returns null when cleanup is unavailable', () => {
        const storage = {
            getItem: () => '{bad json',
            removeItem: () => {
                throw new Error('Storage is read-only');
            },
        };

        expect(loadSession(storage)).toBeNull();
    });

    it('restores drawer texture wall selections', () => {
        const { storage } = createStorage();
        const session = {
            config: { ...DEFAULT_DRAWER, textureWalls: { front: true, sides: false, back: false } },
            highFidelityPreview: false,
        };

        saveSession(storage, session);

        expect(loadSession(storage)).toEqual(session);
    });

    it('restores circular-loft sections without texture settings', () => {
        const { storage } = createStorage();
        const session = {
            config: {
                ...DEFAULT_CIRCULAR_LOFT,
                parameters: {
                    ...DEFAULT_CIRCULAR_LOFT.parameters,
                    sections: [
                        { circles: [{ diameterMm: 60, offsetDistanceMm: 0, offsetAngleDeg: 0 }] },
                        {
                            circles: [
                                {
                                    diameterMm: 40,
                                    offsetDistanceMm: 5.8309518948453,
                                    offsetAngleDeg: 120.96375653207349,
                                },
                            ],
                        },
                    ],
                },
            },
            highFidelityPreview: false,
        };

        saveSession(storage, session);

        expect(loadSession(storage)).toEqual(session);
    });

    it('restores current pot-with-tray settings', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const { storage } = createStorage();
        const session = {
            config: {
                ...DEFAULT_POT_WITH_TRAY,
                tray: { ...DEFAULT_POT_WITH_TRAY.tray, heightMm: 24, engagementWidthMm: 1.5 },
            },
            highFidelityPreview: false,
        };

        saveSession(storage, session);

        expect(loadSession(storage)).toEqual(session);
    });

    it('deletes tray sessions that omit the current engagement width', () => {
        if (DEFAULT_POT_WITH_TRAY.type !== 'pot-with-tray') throw new Error('Broken tray fixture');
        const { engagementWidthMm: _engagementWidthMm, ...legacyTray } = DEFAULT_POT_WITH_TRAY.tray;
        const storage = {
            getItem: () =>
                JSON.stringify({
                    config: { ...DEFAULT_POT_WITH_TRAY, tray: legacyTray },
                    highFidelityPreview: false,
                }),
            removeItem: vi.fn(),
        };

        expect(loadSession(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledOnce();
    });
});

describe('legacy Cartesian loft sessions', () => {
    function legacySession(circles = [{ diameterMm: 60, xMm: 0, yMm: 0 }]) {
        return {
            config: {
                type: 'circular-loft',
                parameters: { sections: [{ circles }, { circles }], gapsMm: [60] },
            },
            highFidelityPreview: true,
        };
    }

    it('migrates legacy centers, retains preferences, and saves only polar offsets', () => {
        const { storage } = createStorage();
        const circles = [
            { diameterMm: 80, xMm: 0, yMm: 0 },
            { diameterMm: 30, xMm: -3, yMm: -4 },
        ];
        storage.setItem('drawer-generator:session', JSON.stringify(legacySession(circles)));
        const restored = loadSession(storage);
        expect(restored?.highFidelityPreview).toBe(true);
        expect(restored?.config.type).toBe('circular-loft');
        if (!restored || restored.config.type !== 'circular-loft')
            throw new Error('Migration failed');
        for (const section of restored.config.parameters.sections) {
            expect(section.circles[0].offsetAngleDeg).toBe(0);
            expect(section.circles[1].offsetDistanceMm).toBe(5);
            const center = circularLoftCircleCenter(section.circles[1]);
            expect(center.xMm).toBeCloseTo(-3, 12);
            expect(center.yMm).toBeCloseTo(-4, 12);
        }
        saveSession(storage, restored);
        const saved = storage.getItem('drawer-generator:session')!;
        expect(saved).not.toContain('xMm');
        expect(saved).not.toContain('yMm');
        expect(loadSession(storage)).toEqual(restored);
        expect(storage.removeItem).not.toHaveBeenCalled();
    });

    it.each([
        { name: 'outer zero diameter', circles: [{ diameterMm: 0, xMm: 0, yMm: 0 }] },
        {
            name: 'tangent inner boundary',
            circles: [
                { diameterMm: 60, xMm: 0, yMm: 0 },
                { diameterMm: 30, xMm: 15, yMm: 0 },
            ],
        },
        {
            name: 'unknown circle field',
            circles: [{ diameterMm: 60, xMm: 0, yMm: 0, unknown: true }],
        },
        {
            name: 'mixed representation',
            circles: [{ diameterMm: 60, xMm: 0, yMm: 0, offsetDistanceMm: 0, offsetAngleDeg: 0 }],
        },
        { name: 'missing coordinate', circles: [{ diameterMm: 60, xMm: 0 }] },
        {
            name: 'overflow after conversion',
            circles: [{ diameterMm: 60, xMm: Number.MAX_VALUE, yMm: Number.MAX_VALUE }],
        },
    ])('cleans up invalid legacy $name', ({ circles }) => {
        const storage = {
            getItem: () =>
                JSON.stringify({
                    ...legacySession(),
                    config: {
                        type: 'circular-loft',
                        parameters: { sections: [{ circles }, { circles }], gapsMm: [60] },
                    },
                }),
            removeItem: vi.fn(),
        };
        expect(loadSession(storage)).toBeNull();
        expect(storage.removeItem).toHaveBeenCalledOnce();
    });

    it('preserves a centered new session’s unwrapped angle', () => {
        const { storage } = createStorage();
        const session = {
            config: {
                ...DEFAULT_CIRCULAR_LOFT,
                parameters: {
                    ...DEFAULT_CIRCULAR_LOFT.parameters,
                    sections: DEFAULT_CIRCULAR_LOFT.parameters.sections.map((section) => ({
                        circles: section.circles.map((circle) => ({
                            ...circle,
                            offsetAngleDeg: -810,
                        })),
                    })),
                },
            },
            highFidelityPreview: false,
        };
        saveSession(storage, session);
        expect(loadSession(storage)).toEqual(session);
    });
});

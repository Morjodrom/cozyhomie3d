import { z } from 'zod';
import {
    FRACTAL_BRANCH_LENGTH_RATIO,
    FRACTAL_BRANCH_WIDTH_RATIO,
    MIN_TEXTURE_FEATURE_MM,
} from './constants';

const textureBaseSchema = z.strictObject({
    seed: z.number().int().min(0).max(0xffffffff),
    scaleMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(250),
    depthMm: z.number().min(0.1).max(20),
    bottomOffsetPercent: z.number().min(0).max(100),
    topOffsetPercent: z.number().min(0).max(100),
    reliefMode: z.enum(['emboss', 'recess']),
    quality: z.enum(['low', 'medium', 'high']),
});

const fadedTextureBaseSchema = textureBaseSchema.extend({
    bottomFadeMm: z.number().min(0).max(500),
    topFadeMm: z.number().min(0).max(500),
});

export const textureSchema = z
    .discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('smooth') }),
        textureBaseSchema.extend({
            kind: z.literal('ribs'),
            angleDeg: z.number().min(-60).max(60),
        }),
        fadedTextureBaseSchema.extend({
            kind: z.literal('noise'),
            dimensions: z.enum(['2d', '3d']),
            octaves: z.number().int().min(1).max(8),
            persistence: z.number().min(0.1).max(1),
        }),
        fadedTextureBaseSchema
            .extend({
                kind: z.literal('honeycomb'),
                spacingMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(250),
                orientation: z.enum(['flat', 'pointy']),
            })
            .superRefine((value, context) => {
                if (value.spacingMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
                    context.addIssue({
                        code: 'custom',
                        path: ['spacingMm'],
                        message: `Honeycomb spacing must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell face.`,
                    });
                }
            }),
        fadedTextureBaseSchema
            .extend({
                kind: z.literal('voronoi'),
                irregularity: z.number().min(0).max(1),
                edgeWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(50),
            })
            .superRefine((value, context) => {
                if (value.edgeWidthMm > value.scaleMm - MIN_TEXTURE_FEATURE_MM) {
                    context.addIssue({
                        code: 'custom',
                        path: ['edgeWidthMm'],
                        message: `Voronoi edge width must leave at least ${MIN_TEXTURE_FEATURE_MM} mm of cell interior.`,
                    });
                }
            }),
        fadedTextureBaseSchema
            .extend({
                kind: z.literal('fractal'),
                levels: z.number().int().min(2).max(8),
                branchAngleDeg: z.number().min(10).max(70),
                branchWidthMm: z.number().min(MIN_TEXTURE_FEATURE_MM).max(50),
            })
            .superRefine((value, context) => {
                const smallestLengthMm =
                    value.scaleMm * FRACTAL_BRANCH_LENGTH_RATIO ** (value.levels - 1);
                if (smallestLengthMm < MIN_TEXTURE_FEATURE_MM) {
                    context.addIssue({
                        code: 'custom',
                        path: ['scaleMm'],
                        message: `Smallest fractal branch must be at least ${MIN_TEXTURE_FEATURE_MM} mm long.`,
                    });
                }
                const smallestWidthMm =
                    value.branchWidthMm * FRACTAL_BRANCH_WIDTH_RATIO ** (value.levels - 1);
                if (smallestWidthMm < MIN_TEXTURE_FEATURE_MM) {
                    context.addIssue({
                        code: 'custom',
                        path: ['branchWidthMm'],
                        message: `Smallest fractal branch must be at least ${MIN_TEXTURE_FEATURE_MM} mm wide.`,
                    });
                }
            }),
    ])
    .superRefine((texture, context) => {
        if (texture.kind === 'smooth') return;
        // Ribs are capsule strokes that may intentionally overlap. Their union still
        // has one relief depth, whereas the other presets need this spacing bound.
        if (texture.kind !== 'ribs' && texture.depthMm > texture.scaleMm / 3) {
            context.addIssue({
                code: 'custom',
                path: ['depthMm'],
                message: 'Texture depth must be no more than one third of its scale.',
            });
        }
        if (
            texture.kind === 'noise' &&
            texture.scaleMm / 2 ** (texture.octaves - 1) < MIN_TEXTURE_FEATURE_MM
        ) {
            context.addIssue({
                code: 'custom',
                path: ['scaleMm'],
                message: `Noise octave wavelength must be at least ${MIN_TEXTURE_FEATURE_MM} mm.`,
            });
        }
    });

export type TextureConfig = z.infer<typeof textureSchema>;

export type TexturedTextureConfig = Exclude<TextureConfig, { kind: 'smooth' }>;

export type TextureKind = TextureConfig['kind'];

const commonTextureDefaults = {
    seed: 1337,
    scaleMm: 5,
    depthMm: 1.2,
    bottomOffsetPercent: 9,
    topOffsetPercent: 9,
    reliefMode: 'emboss' as const,
    bottomFadeMm: 3,
    topFadeMm: 3,
    quality: 'medium' as const,
};

const ribTextureDefaults = {
    seed: commonTextureDefaults.seed,
    scaleMm: commonTextureDefaults.scaleMm,
    depthMm: commonTextureDefaults.depthMm,
    bottomOffsetPercent: commonTextureDefaults.bottomOffsetPercent,
    topOffsetPercent: commonTextureDefaults.topOffsetPercent,
    reliefMode: commonTextureDefaults.reliefMode,
    quality: commonTextureDefaults.quality,
};

/** UI-facing texture registry. Each factory returns a fresh texture object. */

export const TEXTURE_REGISTRY = {
    smooth: { label: 'Smooth', create: () => ({ kind: 'smooth' as const }) },
    ribs: {
        label: 'Ribs',
        create: () => ({ kind: 'ribs' as const, ...ribTextureDefaults, angleDeg: 0 }),
    },
    noise: {
        label: 'Noise',
        create: () => ({
            kind: 'noise' as const,
            ...commonTextureDefaults,
            dimensions: '2d' as const,
            octaves: 3,
            persistence: 0.5,
        }),
    },
    honeycomb: {
        label: 'Honeycomb',
        create: () => ({
            kind: 'honeycomb' as const,
            ...commonTextureDefaults,
            scaleMm: 10,
            depthMm: 0.8,
            quality: 'high' as const,
            spacingMm: 1.4,
            orientation: 'flat' as const,
        }),
    },
    voronoi: {
        label: 'Voronoi',
        create: () => ({
            kind: 'voronoi' as const,
            ...commonTextureDefaults,
            irregularity: 0.45,
            edgeWidthMm: 0.8,
        }),
    },
    fractal: {
        label: 'Fractal branches',
        create: () => ({
            kind: 'fractal' as const,
            ...commonTextureDefaults,
            scaleMm: 18,
            depthMm: 0.8,
            levels: 4,
            branchAngleDeg: 32,
            branchWidthMm: 2,
        }),
    },
} satisfies Record<TextureKind, { label: string; create: () => TextureConfig }>;

export const TEXTURE_KINDS = Object.keys(TEXTURE_REGISTRY) as TextureKind[];

export function createTextureDefault(kind: TextureKind): TextureConfig {
    return TEXTURE_REGISTRY[kind].create();
}

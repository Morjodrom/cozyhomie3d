import type { DesignConfig } from '../domain/design';
import type { DrawerParameters } from '../shapes/drawer/domain/design';
import type { PotParameters } from '../shapes/pot/domain/design';
import type { TextureConfig } from '../domain/shared/textures';
import {
    FRACTAL_BRANCH_LENGTH_RATIO,
    FRACTAL_BRANCH_WIDTH_RATIO,
} from '../domain/shared/constants';
import { trayConnectorDimensions } from '../shapes/pot-with-tray/domain/design';
import type { BuildQuality } from '../domain/worker';
import { potTexturePerimeter } from '../shapes/pot/geometry/mesh';
import type { Tessellation } from './mesh/types';
import { textureToleranceMm } from './surface/quality';
import { fractalTextureDensityReduced } from './surface/vector-textures';

const BASE_TESSELLATION: Record<BuildQuality, Tessellation> = {
    draft: { circularSegments: 48, verticalSegments: 10, drawerSideSegments: 24, edgeSegments: 3 },
    preview: {
        circularSegments: 72,
        verticalSegments: 16,
        drawerSideSegments: 36,
        edgeSegments: 5,
    },
    export: {
        circularSegments: 108,
        verticalSegments: 26,
        drawerSideSegments: 54,
        edgeSegments: 8,
    },
};

const TEXTURE_SAMPLES: Record<'low' | 'medium' | 'high', number> = {
    low: 4,
    medium: 6,
    high: 8,
};
const BUILD_SAMPLES: Record<BuildQuality, number> = { draft: 0.65, preview: 1, export: 1.35 };
const RAW_TRIANGLE_BUDGET: Record<BuildQuality, number> = {
    draft: 35_000,
    preview: 100_000,
    export: 240_000,
};

export type TessellationPlan = { tessellation: Tessellation; warnings: string[] };

function textureFeatureScale(texture: TextureConfig): number {
    if (texture.kind === 'smooth') return Number.POSITIVE_INFINITY;
    if (texture.kind === 'noise') return texture.scaleMm / 2 ** (texture.octaves - 1);
    if (texture.kind === 'honeycomb') return Math.min(texture.scaleMm, texture.spacingMm);
    if (texture.kind === 'voronoi') return Math.min(texture.scaleMm, texture.edgeWidthMm);
    if (texture.kind === 'fractal')
        return Math.min(
            texture.scaleMm * FRACTAL_BRANCH_LENGTH_RATIO ** (texture.levels - 1),
            texture.branchWidthMm * FRACTAL_BRANCH_WIDTH_RATIO ** (texture.levels - 1),
        );
    return texture.scaleMm;
}

function fractalSurfaceDimensions(config: DesignConfig): readonly [number, number] {
    if (config.type === 'drawer') {
        return [
            2 * (config.parameters.widthMm + config.parameters.depthMm),
            config.parameters.heightMm,
        ];
    }
    if (config.type === 'pot')
        return [potTexturePerimeter(config.parameters), config.parameters.heightMm];
    const connector = trayConnectorDimensions(config.parameters, config.tray);
    const combined: PotParameters = {
        ...config.parameters,
        heightMm: config.parameters.heightMm + config.tray.heightMm,
        bottomDiameterMm: connector.trayBottomRadiusMm * 2,
    };
    return [potTexturePerimeter(combined), combined.heightMm];
}

function clampGrid(
    horizontal: number,
    vertical: number,
    budget: number,
): readonly [number, number, boolean] {
    const current = horizontal * vertical * 2;
    if (current <= budget) return [horizontal, vertical, false];
    const factor = Math.sqrt(budget / current);
    return [
        Math.max(3, Math.floor(horizontal * factor)),
        Math.max(2, Math.floor(vertical * factor)),
        true,
    ];
}

/**
 * Selects a feature-aware surface grid. Preview deliberately uses fewer samples
 * than export; the raw grid is budgeted before boolean operations so final output
 * stays comfortably under the hard 500k triangle limit.
 */
export function planTessellation(config: DesignConfig, quality: BuildQuality): TessellationPlan {
    const base = { ...BASE_TESSELLATION[quality] };
    const texture = config.texture;
    if (texture.kind === 'smooth') return { tessellation: base, warnings: [] };
    if (config.type === 'drawer' && !Object.values(config.textureWalls).some(Boolean)) {
        return { tessellation: base, warnings: [] };
    }

    // Geometric presets are contour-defined.  Their straightness is independent
    // of a UV grid; only the carrier's circular chord error needs tessellation.
    if (texture.kind !== 'noise') {
        const [perimeterMm, heightMm] = fractalSurfaceDimensions(config);
        const warnings = fractalTextureDensityReduced(texture, perimeterMm, heightMm)
            ? [
                  'Fractal branch density was reduced to keep the mesh below the export complexity limit.',
              ]
            : [];
        if (config.type === 'drawer') return { tessellation: base, warnings };
        const trayBottomDiameter =
            config.type === 'pot-with-tray'
                ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
                : 0;
        const radius =
            Math.max(
                config.parameters.bottomDiameterMm,
                config.parameters.topDiameterMm,
                trayBottomDiameter,
            ) / 2;
        const tolerance = Math.min(radius, textureToleranceMm(texture, quality));
        const circularSegments = Math.max(
            base.circularSegments,
            Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - tolerance / radius))),
        );
        return { tessellation: { ...base, circularSegments }, warnings };
    }

    const samples = TEXTURE_SAMPLES[texture.quality] * BUILD_SAMPLES[quality];
    const featureScale = textureFeatureScale(texture);
    const height =
        config.parameters.heightMm + (config.type === 'pot-with-tray' ? config.tray.heightMm : 0);
    const vertical = Math.max(base.verticalSegments, Math.ceil((height / featureScale) * samples));
    const warnings: string[] = [];

    if (config.type !== 'drawer') {
        const trayBottomDiameter =
            config.type === 'pot-with-tray'
                ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
                : 0;
        const perimeter =
            Math.PI *
            Math.max(
                config.parameters.bottomDiameterMm,
                config.parameters.topDiameterMm,
                trayBottomDiameter,
            );
        let horizontal = Math.max(
            base.circularSegments,
            Math.ceil((perimeter / featureScale) * samples),
        );
        const [circularSegments, verticalSegments, clamped] = clampGrid(
            horizontal,
            vertical,
            RAW_TRIANGLE_BUDGET[quality],
        );
        if (clamped)
            warnings.push(
                'Texture sampling was reduced to keep the mesh below the export complexity limit.',
            );
        return { tessellation: { ...base, circularSegments, verticalSegments }, warnings };
    }

    const parameters: DrawerParameters = config.parameters;
    const perSide = Math.max(
        base.drawerSideSegments,
        Math.ceil((Math.max(parameters.widthMm, parameters.depthMm) / featureScale) * samples),
    );
    const [horizontal, verticalSegments, clamped] = clampGrid(
        perSide * 4,
        vertical,
        RAW_TRIANGLE_BUDGET[quality],
    );
    if (clamped)
        warnings.push(
            'Texture sampling was reduced to keep the mesh below the export complexity limit.',
        );
    return {
        tessellation: {
            ...base,
            drawerSideSegments: Math.max(3, Math.floor(horizontal / 4)),
            verticalSegments,
        },
        warnings,
    };
}

export function vectorOptions(
    config: DesignConfig,
    quality: BuildQuality,
    tessellation: Tessellation,
): { carrierSagittaMm: number; chordErrorMm: number } {
    const chordErrorMm = textureToleranceMm(config.texture, quality);
    if (config.type === 'drawer') return { carrierSagittaMm: 0, chordErrorMm };
    const trayBottomDiameter =
        config.type === 'pot-with-tray'
            ? trayConnectorDimensions(config.parameters, config.tray).trayBottomRadiusMm * 2
            : 0;
    const radius =
        Math.max(
            config.parameters.bottomDiameterMm,
            config.parameters.topDiameterMm,
            trayBottomDiameter,
        ) / 2;
    return {
        carrierSagittaMm: radius * (1 - Math.cos(Math.PI / tessellation.circularSegments)),
        chordErrorMm,
    };
}
